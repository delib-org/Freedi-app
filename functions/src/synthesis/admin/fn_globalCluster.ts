import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { dissolveQuestionSynthesis } from '../derivedDocs';
import { buildCandidateClusters } from '../candidateClusters';
import { generateTopicLabel } from '../../services/integration-ai-service';
import { performIntegration } from '../../integrate/performIntegration';
import { recomputeClusterEvaluation } from '../../condensation/aggregation';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Admin-initiated "Global cluster" — a single whole-question clustering pass.
 *
 * Unlike `reCluster` (which dissolves, then re-runs the INCREMENTAL one-option-
 * at-a-time pipeline via the queue), this looks at ALL eligible options at once
 * and groups them in one shot, then writes a topic-cluster per group. Seeing the
 * whole corpus together surfaces coherent themes that the order-dependent
 * incremental pass leaves unclustered.
 *
 * Grouping uses cosine-threshold edges + connected components
 * (`buildCandidateClusters`), NOT UMAP→DBSCAN — the latter projects 1536-d
 * embeddings onto a connected manifold and returns a few giant blobs with zero
 * singletons (see `candidateClusters.ts`). Connected components preserves
 * genuinely-distinct ideas as singletons and only groups what is actually close.
 *
 * The grouping threshold is the single most important knob and is corpus-
 * dependent — it is therefore an explicit request parameter (with an env default)
 * rather than silently tuned. With gist embeddings on (see gist-service), the
 * geometry sharpens, so a lower threshold than the near-duplicate synthesis path
 * captures topical groups without blobbing.
 *
 * Each group becomes a TOPIC cluster (`derivedByPipeline: 'topic-cluster'`),
 * labelled by `generateTopicLabel`. This is the cheap "name what they share"
 * path, not the heavier proposal synthesis — themes group related-but-distinct
 * ideas; they don't claim the members are the same proposal.
 *
 * Synchronous: typical questions (tens to low-hundreds of options) yield a
 * handful of groups, so the LLM label calls fit comfortably in the 540s budget.
 */

interface GlobalClusterRequest {
	questionId: string;
	/** Cosine grouping threshold in (0, 1]. Falls back to env / default. */
	threshold?: number;
}

interface GlobalClusterResponse {
	clustersReversed: number;
	docsArchived: number;
	membersRestored: number;
	evaluationsDeleted: number;
	eligibleOptions: number;
	groupsFound: number;
	clustersCreated: number;
	singletons: number;
	threshold: number;
}

/**
 * Default grouping threshold. Lower than the near-duplicate synthesis default
 * (~0.90) because this pass intentionally forms broader topical groups, and gist
 * embeddings spread distinct topics further apart. Override per run or via env
 * `GLOBAL_CLUSTER_THRESHOLD`.
 */
const DEFAULT_GLOBAL_CLUSTER_THRESHOLD = 0.55;
const MAX_CONCURRENT_GROUPS = 5;

function db() {
	return getFirestore();
}

function resolveThreshold(requested?: number): number {
	if (typeof requested === 'number' && requested > 0 && requested <= 1) return requested;
	const env = Number(process.env.GLOBAL_CLUSTER_THRESHOLD);
	if (Number.isFinite(env) && env > 0 && env <= 1) return env;

	return DEFAULT_GLOBAL_CLUSTER_THRESHOLD;
}

export const globalCluster = onCall<GlobalClusterRequest>(
	{
		timeoutSeconds: 540,
		memory: '2GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<GlobalClusterResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		const question = await assertSynthesisAdmin(questionId, uid);
		const threshold = resolveThreshold(request.data.threshold);

		// 1. Clean slate: dissolve any prior synthesis output (restores members).
		const dissolve = await dissolveQuestionSynthesis(questionId, { reversedByUserId: uid });

		// 2. Load eligible options (evaluator-count gate only — consensus does not
		//    gate clustering). Skip hidden / cluster / already-integrated docs.
		const settings = await loadSynthesisSettings(questionId);
		const optionsSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		const eligibleIds: string[] = [];
		for (const doc of optionsSnap.docs) {
			const option = doc.data() as Statement;
			if (option.hide === true) continue;
			if (option.isCluster === true) continue;
			if ((option.integratedOptions ?? []).length > 0) continue;
			const evals = option.evaluation?.numberOfEvaluators ?? 0;
			if (evals < settings.minEvaluators) continue;
			eligibleIds.push(option.statementId);
		}

		// 3. Group the whole set at once: cosine edges + connected components.
		const { clusters, singletonCount } = await buildCandidateClusters(eligibleIds, {
			parentId: questionId,
			threshold,
		});

		const questionContext = question.statement || questionId;
		const adminDoc = await db().collection('usersV2').doc(uid).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;
		const creatorDisplayName = adminData?.displayName || 'Admin';
		const creatorDefaultLanguage = adminData?.defaultLanguage || 'en';

		// 4. For each group (≥2), label it and write a topic cluster.
		const limit = pLimit(MAX_CONCURRENT_GROUPS);
		const createdClusterIds: string[] = [];
		await Promise.all(
			clusters.map((cluster) =>
				limit(async () => {
					try {
						const memberDocs = await Promise.all(
							cluster.memberIds.map((id) => db().collection(Collections.statements).doc(id).get()),
						);
						const members = memberDocs.filter((d) => d.exists).map((d) => d.data() as Statement);
						if (members.length < 2) return;

						const label = await generateTopicLabel(members, questionContext);
						const result = await performIntegration({
							parentStatementId: questionId,
							selectedStatementIds: members.map((m) => m.statementId),
							integratedTitle: label.title,
							integratedDescription: label.description,
							creatorId: uid,
							creatorDisplayName,
							creatorDefaultLanguage,
							derivedByPipeline: 'topic-cluster',
							synthesisMechanism: 'bulk',
						});
						createdClusterIds.push(result.newStatementId);
					} catch (error) {
						logger.error('globalCluster: group integration failed', {
							questionId,
							memberIds: cluster.memberIds,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}),
			),
		);

		// 5. Re-aggregate each new cluster's evaluation from its members.
		const finalizeLimit = pLimit(MAX_CONCURRENT_GROUPS);
		await Promise.all(
			createdClusterIds.map((clusterId) =>
				finalizeLimit(async () => {
					try {
						await recomputeClusterEvaluation(clusterId);
					} catch (error) {
						logger.warn('globalCluster: finalize recompute failed (non-fatal)', {
							clusterId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}),
			),
		);

		const response: GlobalClusterResponse = {
			clustersReversed: dissolve.clustersReversed,
			docsArchived: dissolve.docsArchived,
			membersRestored: dissolve.membersRestored,
			evaluationsDeleted: dissolve.evaluationsDeleted,
			eligibleOptions: eligibleIds.length,
			groupsFound: clusters.length,
			clustersCreated: createdClusterIds.length,
			singletons: singletonCount,
			threshold,
		};
		logger.info('globalCluster.complete', { questionId, uid, ...response });

		return response;
	},
);

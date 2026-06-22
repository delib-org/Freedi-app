import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { dissolveQuestionSynthesis } from '../derivedDocs';
import { buildCandidateClusters } from '../candidateClusters';
import { cosineSimilarity, meanVector } from '../bulkCluster';
import { embeddingCache } from '../../services/embedding-cache-service';
import {
	generateTopicLabel,
	generateSynthesizedProposal,
	type StatementWithEvaluation,
} from '../../services/integration-ai-service';
import { performIntegration } from '../../integrate/performIntegration';
import { recomputeClusterEvaluation } from '../../condensation/aggregation';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Admin-initiated "Global cluster" — a single whole-question clustering pass.
 *
 * Unlike `reCluster` (which dissolves, then re-runs the INCREMENTAL one-option-
 * at-a-time pipeline via the queue), this looks at ALL eligible options at once
 * and groups them in one shot. Seeing the whole corpus together surfaces
 * coherent themes that the order-dependent incremental pass leaves unclustered.
 *
 * It uses the SAME thresholds the admin already configures in "Advanced
 * similarity thresholds" — there is no separate global knob:
 *
 *   - group options into components at `clusterThreshold` (the topic floor),
 *     using cosine edges + connected components (NOT UMAP→DBSCAN, which blobs —
 *     see `candidateClusters.ts`),
 *   - a tight component (mean member→centroid cosine ≥ `attachThreshold`, the
 *     "Synth (near-duplicate)" line in the panel) becomes a SYNTH, and
 *   - a looser component becomes a TOPIC cluster (a named theme).
 *
 * So the global pass produces the same synth/topic split as the live pipeline,
 * just computed globally instead of incrementally.
 *
 * Synchronous: typical questions (tens to low-hundreds of options) yield a
 * handful of groups, so the LLM calls fit comfortably in the 540s budget.
 */

interface GlobalClusterRequest {
	questionId: string;
}

interface GlobalClusterResponse {
	clustersReversed: number;
	docsArchived: number;
	membersRestored: number;
	evaluationsDeleted: number;
	eligibleOptions: number;
	groupsFound: number;
	synthsCreated: number;
	topicsCreated: number;
	singletons: number;
	clusterThreshold: number;
	synthThreshold: number;
}

const MAX_CONCURRENT_GROUPS = 5;

function db() {
	return getFirestore();
}

/** Mean cosine of each member embedding to the group centroid — its cohesion. */
function groupCohesion(vectors: number[][]): number {
	if (vectors.length < 2) return 1;
	const centroid = meanVector(vectors);
	if (centroid.length === 0) return 0;
	let sum = 0;
	for (const v of vectors) sum += cosineSimilarity(v, centroid);

	return sum / vectors.length;
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
		const settings = await loadSynthesisSettings(questionId);

		// 1. Clean slate: dissolve any prior synthesis output (restores members).
		const dissolve = await dissolveQuestionSynthesis(questionId, { reversedByUserId: uid });

		// 2. Load eligible options (evaluator-count gate only — consensus does not
		//    gate clustering). Skip hidden / cluster / already-integrated docs.
		const optionsSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		const eligible = new Map<string, Statement>();
		for (const doc of optionsSnap.docs) {
			const option = doc.data() as Statement;
			if (option.hide === true) continue;
			if (option.isCluster === true) continue;
			if ((option.integratedOptions ?? []).length > 0) continue;
			if ((option.evaluation?.numberOfEvaluators ?? 0) < settings.minEvaluators) continue;
			eligible.set(option.statementId, option);
		}
		const eligibleIds = [...eligible.keys()];

		// 3. Group the whole set at once at the TOPIC floor (clusterThreshold).
		const { clusters, singletonCount } = await buildCandidateClusters(eligibleIds, {
			parentId: questionId,
			threshold: settings.clusterThreshold,
		});

		const embeddings = await embeddingCache.getBatchEmbeddings(eligibleIds);
		const questionContext = question.statement || questionId;
		const adminDoc = await db().collection('usersV2').doc(uid).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;
		const creatorDisplayName = adminData?.displayName || 'Admin';
		const creatorDefaultLanguage = adminData?.defaultLanguage || 'en';

		// 4. For each group (≥2): a tight group → synth, otherwise → topic cluster.
		const limit = pLimit(MAX_CONCURRENT_GROUPS);
		const created: Array<{ id: string; kind: 'synthesis' | 'topic-cluster' }> = [];
		await Promise.all(
			clusters.map((cluster) =>
				limit(async () => {
					const members = cluster.memberIds
						.map((id) => eligible.get(id))
						.filter((m): m is Statement => Boolean(m));
					if (members.length < 2) return;

					const vectors = members
						.map((m) => embeddings.get(m.statementId))
						.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
					const cohesion = vectors.length >= 2 ? groupCohesion(vectors) : 0;
					// Promote to a synth when the group is at least as tight as the
					// "Synth (near-duplicate)" threshold the admin sets in the panel
					// (attachThreshold); otherwise it's a topic cluster.
					const wantSynth = cohesion >= settings.attachThreshold;

					try {
						let title: string;
						let description: string;
						let paragraphs: string[] | undefined;
						let derivedByPipeline: 'synthesis' | 'topic-cluster';

						if (wantSynth) {
							const llmInputs: StatementWithEvaluation[] = members.map((m) => ({
								statementId: m.statementId,
								statement: m.statement || '',
								paragraphsText: '',
								numberOfEvaluators: m.evaluation?.numberOfEvaluators ?? 0,
								consensus: m.consensus ?? m.evaluation?.agreement ?? 0,
								sumEvaluations: m.evaluation?.sumEvaluations ?? 0,
							}));
							const proposal = await generateSynthesizedProposal(llmInputs, questionContext);
							if (proposal.cannotSynthesize === true) {
								// Directional conflict etc. — fall back to a topic label.
								const label = await generateTopicLabel(members, questionContext);
								title = label.title;
								description = label.description;
								derivedByPipeline = 'topic-cluster';
							} else {
								title = proposal.title;
								description = proposal.description;
								paragraphs = proposal.paragraphs;
								derivedByPipeline = 'synthesis';
							}
						} else {
							const label = await generateTopicLabel(members, questionContext);
							title = label.title;
							description = label.description;
							derivedByPipeline = 'topic-cluster';
						}

						const result = await performIntegration({
							parentStatementId: questionId,
							selectedStatementIds: members.map((m) => m.statementId),
							integratedTitle: title,
							integratedDescription: description,
							creatorId: uid,
							creatorDisplayName,
							creatorDefaultLanguage,
							derivedByPipeline,
							synthesisMechanism: 'bulk',
							paragraphs,
						});
						created.push({ id: result.newStatementId, kind: derivedByPipeline });
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
			created.map((c) =>
				finalizeLimit(async () => {
					try {
						await recomputeClusterEvaluation(c.id);
					} catch (error) {
						logger.warn('globalCluster: finalize recompute failed (non-fatal)', {
							clusterId: c.id,
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
			synthsCreated: created.filter((c) => c.kind === 'synthesis').length,
			topicsCreated: created.filter((c) => c.kind === 'topic-cluster').length,
			singletons: singletonCount,
			clusterThreshold: settings.clusterThreshold,
			synthThreshold: settings.attachThreshold,
		};
		logger.info('globalCluster.complete', { questionId, uid, ...response });

		return response;
	},
);

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { dissolveQuestionSynthesis } from '../derivedDocs';
import { cosineSimilarity } from '../bulkCluster';
import { refineComponent } from '../completeLinkage';
import { judgeSemanticEquivalenceCached } from '../../services/verdict-cache-service';
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
 * coherent themes the order-dependent incremental pass leaves unclustered.
 *
 * Grouping is COMPLETE-LINKAGE on cosine, not single-linkage / connected
 * components. Deliberation corpora are dense — every option is a variation of
 * "my vision for the place" — so single-linkage chains the whole question into
 * one blob at any threshold low enough to form a group (measured: 61 options
 * collapse into one component at every cosine ≤ 0.86). Complete-linkage requires
 * EVERY pair in a group to clear the threshold, so it cannot chain: it yields
 * tight, coherent groups at exactly the thresholds the admin configures.
 *
 * Two tiers, using the panel's own thresholds:
 *   1. SYNTH: cosine complete-linkage at `attachThreshold` (the "Synth
 *      (near-duplicate)" line) forms candidate groups, then an LLM equivalence
 *      judge (`refineComponent`) splits each into verified-"same" cliques —
 *      cosine alone can't tell "absorb families" from "absorb RELIGIOUS
 *      families" (both ~0.93), the judge can. Surviving cliques become synths.
 *   2. TOPIC: whatever is left (cosine-singletons + judge-peeled members) is
 *      grouped at `clusterThreshold` (the "Topic cluster" line) into named
 *      themes — no equivalence judge, since topics are related-but-distinct.
 * Options in neither stay standalone.
 *
 * Synchronous: complete-linkage is O(n^3); fine for the typical tens-to-low-
 * hundreds of options. Above MAX_OPTIONS it bails rather than blow the budget.
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
	synthsCreated: number;
	topicsCreated: number;
	standalone: number;
	clusterThreshold: number;
	synthThreshold: number;
}

const MAX_CONCURRENT_GROUPS = 5;
/** Complete-linkage is O(n^3); guard against pathologically large questions. */
const MAX_OPTIONS = 600;

interface Item {
	id: string;
	statement: Statement;
	emb: number[];
}

/**
 * Agglomerative COMPLETE-LINKAGE clustering: repeatedly merge the two clusters
 * whose WEAKEST cross-pair cosine is highest, stopping once that best weakest
 * link drops below `threshold`. Every resulting cluster therefore has all pairs
 * ≥ threshold — no chaining, no blobs. Returns groups of size ≥ 2 plus the
 * leftover singleton ids.
 */
function completeLinkageGroups(
	items: Item[],
	threshold: number,
): { groups: Item[][]; singletons: Item[] } {
	const n = items.length;
	if (n < 2) return { groups: [], singletons: items };

	// Precompute the cosine matrix once.
	const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const c = cosineSimilarity(items[i].emb, items[j].emb);
			sim[i][j] = c;
			sim[j][i] = c;
		}
	}

	let clusters: number[][] = items.map((_, i) => [i]);
	const minLink = (a: number[], b: number[]): number => {
		let m = Infinity;
		for (const i of a) for (const j of b) m = Math.min(m, sim[i][j]);

		return m;
	};

	for (;;) {
		let bi = -1;
		let bj = -1;
		let best = threshold;
		for (let i = 0; i < clusters.length; i++) {
			for (let j = i + 1; j < clusters.length; j++) {
				const m = minLink(clusters[i], clusters[j]);
				if (m >= best) {
					best = m;
					bi = i;
					bj = j;
				}
			}
		}
		if (bi < 0) break;
		clusters[bi] = clusters[bi].concat(clusters[bj]);
		clusters.splice(bj, 1);
	}

	const groups: Item[][] = [];
	const singletons: Item[] = [];
	for (const c of clusters) {
		if (c.length >= 2) groups.push(c.map((i) => items[i]));
		else singletons.push(items[c[0]]);
	}

	return { groups, singletons };
}

function db() {
	return getFirestore();
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

		const eligibleStatements: Statement[] = [];
		for (const doc of optionsSnap.docs) {
			const option = doc.data() as Statement;
			if (option.hide === true) continue;
			if (option.isCluster === true) continue;
			if ((option.integratedOptions ?? []).length > 0) continue;
			if ((option.evaluation?.numberOfEvaluators ?? 0) < settings.minEvaluators) continue;
			eligibleStatements.push(option);
		}

		if (eligibleStatements.length > MAX_OPTIONS) {
			throw new HttpsError(
				'failed-precondition',
				`Global cluster supports up to ${MAX_OPTIONS} options (found ${eligibleStatements.length}); use Re-cluster for very large questions.`,
			);
		}

		const embeddings = await embeddingCache.getBatchEmbeddings(
			eligibleStatements.map((s) => s.statementId),
		);
		const items: Item[] = eligibleStatements
			.map((statement) => {
				const emb = embeddings.get(statement.statementId);

				return emb && emb.length > 0 ? { id: statement.statementId, statement, emb } : null;
			})
			.filter((x): x is Item => x !== null);

		// 3. SYNTH tier — two stages so synths are tight AND semantically true:
		//    (a) cosine complete-linkage at attachThreshold forms cheap candidate
		//        groups, then (b) an LLM equivalence judge (refineComponent) splits
		//        each candidate into verified-"same" cliques. Cosine alone can't tell
		//        "absorb families" from "absorb RELIGIOUS families" (both ~0.93); the
		//        judge peels the non-matching member out. Only cliques of ≥2 survive
		//        as synths; everything the judge peels off falls through to topics.
		const itemById = new Map(items.map((it) => [it.id, it]));
		const texts = new Map(items.map((it) => [it.id, it.statement.statement || '']));
		const synthCandidates = completeLinkageGroups(items, settings.attachThreshold);

		const judgeLimit = pLimit(MAX_CONCURRENT_GROUPS);
		const refined = await Promise.all(
			synthCandidates.groups.map((g) =>
				judgeLimit(() =>
					refineComponent(
						{ memberIds: g.map((m) => m.id), texts, verdicts: new Map() },
						judgeSemanticEquivalenceCached,
					),
				),
			),
		);

		const verifiedSynthGroups: Item[][] = [];
		const consumed = new Set<string>();
		for (const res of refined) {
			for (const clique of res.cliques) {
				const group = clique
					.map((id) => itemById.get(id))
					.filter((x): x is Item => x !== undefined);
				if (group.length >= 2) {
					verifiedSynthGroups.push(group);
					clique.forEach((id) => consumed.add(id));
				}
			}
		}

		// 4. TOPIC tier — group everything NOT in a verified synth (cosine-singletons
		//    plus judge-peeled members) at clusterThreshold. No equivalence judge
		//    here: topics intentionally group related-but-DISTINCT ideas, so a
		//    "same" check would reject them all.
		const remainingItems = items.filter((it) => !consumed.has(it.id));
		const topicPass = completeLinkageGroups(remainingItems, settings.clusterThreshold);

		const questionContext = question.statement || questionId;
		const adminDoc = await db().collection('usersV2').doc(uid).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;
		const creatorDisplayName = adminData?.displayName || 'Admin';
		const creatorDefaultLanguage = adminData?.defaultLanguage || 'en';

		const integrate = async (
			members: Item[],
			intent: 'synthesis' | 'topic-cluster',
		): Promise<{ id: string; kind: 'synthesis' | 'topic-cluster' } | null> => {
			try {
				let title: string;
				let description: string;
				let paragraphs: string[] | undefined;
				let derivedByPipeline: 'synthesis' | 'topic-cluster' = intent;

				if (intent === 'synthesis') {
					const llmInputs: StatementWithEvaluation[] = members.map((m) => ({
						statementId: m.id,
						statement: m.statement.statement || '',
						paragraphsText: '',
						numberOfEvaluators: m.statement.evaluation?.numberOfEvaluators ?? 0,
						consensus: m.statement.consensus ?? m.statement.evaluation?.agreement ?? 0,
						sumEvaluations: m.statement.evaluation?.sumEvaluations ?? 0,
					}));
					const proposal = await generateSynthesizedProposal(llmInputs, questionContext);
					if (proposal.cannotSynthesize === true) {
						const label = await generateTopicLabel(
							members.map((m) => m.statement),
							questionContext,
						);
						title = label.title;
						description = label.description;
						derivedByPipeline = 'topic-cluster';
					} else {
						title = proposal.title;
						description = proposal.description;
						paragraphs = proposal.paragraphs;
					}
				} else {
					const label = await generateTopicLabel(
						members.map((m) => m.statement),
						questionContext,
					);
					title = label.title;
					description = label.description;
				}

				// Synth = a merged proposal that REPLACES its sources → hide them +
				// migrate evals onto the synth. Topic = a grouping of VISIBLE options
				// → keep members visible so the options-view selector nests them
				// (a hidden topic member resolves to "No originals found"); the
				// cluster's aggregate comes from recomputeClusterEvaluation.
				const isSynth = derivedByPipeline === 'synthesis';
				const result = await performIntegration({
					parentStatementId: questionId,
					selectedStatementIds: members.map((m) => m.id),
					integratedTitle: title,
					integratedDescription: description,
					creatorId: uid,
					creatorDisplayName,
					creatorDefaultLanguage,
					derivedByPipeline,
					synthesisMechanism: 'bulk',
					paragraphs,
					hideMembers: isSynth,
					migrateEvaluations: isSynth,
				});

				return { id: result.newStatementId, kind: derivedByPipeline };
			} catch (error) {
				logger.error('globalCluster: group integration failed', {
					questionId,
					memberIds: members.map((m) => m.id),
					error: error instanceof Error ? error.message : String(error),
				});

				return null;
			}
		};

		// 5. Build all groups concurrently (capped).
		const limit = pLimit(MAX_CONCURRENT_GROUPS);
		const jobs = [
			...verifiedSynthGroups.map((g) => () => integrate(g, 'synthesis')),
			...topicPass.groups.map((g) => () => integrate(g, 'topic-cluster')),
		];
		const created = (await Promise.all(jobs.map((job) => limit(job)))).filter(
			(c): c is { id: string; kind: 'synthesis' | 'topic-cluster' } => c !== null,
		);

		// 6. Re-aggregate each new cluster's evaluation from its members.
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
			eligibleOptions: items.length,
			synthsCreated: created.filter((c) => c.kind === 'synthesis').length,
			topicsCreated: created.filter((c) => c.kind === 'topic-cluster').length,
			standalone: topicPass.singletons.length,
			clusterThreshold: settings.clusterThreshold,
			synthThreshold: settings.attachThreshold,
		};
		logger.info('globalCluster.complete', { questionId, uid, ...response });

		return response;
	},
);

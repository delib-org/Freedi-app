import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';
import { generateSynthesizedProposal } from '../../services/integration-ai-service';
import type { StatementWithEvaluation } from '../../services/integration-ai-service';
import { bayesianFilterOptions } from '../scoring';
import { bulkClusterByEmbedding } from '../bulkCluster';
import { twoTierJudge, type ClusterMember } from '../twoTierJudge';
import { synthesisFlags } from '../featureFlags';
import {
	claimPhase,
	getJob,
	heartbeat,
	markFailed,
	transitionToNext,
	type JobClusterAssignment,
	type JobProposal,
	type JobVerifiedCluster,
	type SynthesisJob,
} from './jobState';

/**
 * Async-job phase handlers. Each is invoked by the dispatcher
 * (`fn_synthesisJobDispatch`) when a job's status matches the phase
 * name. Phases share a contract:
 *
 *   1. Claim (idempotent — exit if already done).
 *   2. Read job state.
 *   3. Run work using the existing synthesis primitives (no logic
 *      duplication; this module is pure orchestration).
 *   4. Write phase output + transition to the next status.
 *
 * Each phase function returns void. Errors are caught at the top and
 * routed through `markFailed` so the job state is always consistent
 * even if the underlying primitive throws.
 */

const REQUIRED_EMBEDDING_COVERAGE = 90;

function db() {
	return getFirestore();
}

interface OptionLite {
	statementId: string;
	statement: string;
	consensus: number;
	numberOfEvaluators: number;
}

async function loadEligibleOptionsForJob(
	parentId: string,
	filters: Record<string, unknown>,
): Promise<OptionLite[]> {
	const snap = await db()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option)
		.get();
	const minAverage = typeof filters.minAverage === 'number' ? filters.minAverage : undefined;
	const minConsensus = typeof filters.minConsensus === 'number' ? filters.minConsensus : undefined;
	const minEvaluators =
		typeof filters.minEvaluators === 'number' ? filters.minEvaluators : undefined;
	const out: OptionLite[] = [];
	for (const doc of snap.docs) {
		const data = doc.data() as Statement;
		if (data.hide === true) continue;
		if (data.isCluster === true) continue;
		if (!data.statementId || !data.statement) continue;
		const averageEvaluation = data.evaluation?.averageEvaluation ?? 0;
		const numberOfEvaluators = data.evaluation?.numberOfEvaluators ?? 0;
		const consensus = data.consensus ?? 0;
		if (minAverage !== undefined && averageEvaluation < minAverage) continue;
		if (minConsensus !== undefined && consensus < minConsensus) continue;
		if (minEvaluators !== undefined && numberOfEvaluators < minEvaluators) continue;
		out.push({
			statementId: data.statementId,
			statement: data.statement,
			consensus,
			numberOfEvaluators,
		});
	}

	return out;
}

/**
 * PHASE 1 — loading + Bayesian pre-filter.
 *
 * Reads the job's `questionId` + `filters`, loads eligible options from
 * Firestore, optionally narrows the working set via the Bayesian filter
 * (Ship 1.3), then transitions to `clustering`. Output: `workingSetIds`.
 *
 * If embedding coverage is below the gate, the job goes straight to
 * `failed` with an explanatory error so the admin can backfill embeddings
 * before retrying.
 */
export async function runLoadingPhase(jobId: string): Promise<void> {
	if (!(await claimPhase(jobId, 'loading'))) return;
	try {
		const job = await getJob(jobId);
		if (!job) return;

		await heartbeat(jobId, 'Checking embedding coverage');
		const coverage = await embeddingCache.getEmbeddingCoverage(job.questionId);
		if (coverage.coveragePercent < REQUIRED_EMBEDDING_COVERAGE) {
			await markFailed(
				jobId,
				`Embedding coverage ${coverage.coveragePercent.toFixed(1)}% below required ${REQUIRED_EMBEDDING_COVERAGE}%`,
			);

			return;
		}

		await heartbeat(jobId, 'Loading eligible options');
		const raw = await loadEligibleOptionsForJob(job.questionId, job.filters);

		let workingSet = raw;
		let bayesianStats: SynthesisJob['bayesianStats'];
		if (synthesisFlags.bayesianPrefilter && raw.length > 0) {
			const filterStatements = raw.map((o) => ({
				statementId: o.statementId,
				statement: o.statement,
				consensus: o.consensus,
				evaluation: { numberOfEvaluators: o.numberOfEvaluators, agreement: o.consensus },
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			})) as any;
			const result = bayesianFilterOptions(filterStatements);
			const keptIds = new Set(result.kept.map((s) => s.statement.statementId));
			workingSet = raw.filter((o) => keptIds.has(o.statementId));
			bayesianStats = {
				inputCount: result.stats.inputCount,
				keptCount: result.stats.keptCount,
				prior: result.stats.prior,
				sigma: result.stats.sigma,
				cutoff: result.stats.cutoff,
			};
		}

		const workingSetIds = workingSet.map((o) => o.statementId);
		const payload: Partial<SynthesisJob> = {
			workingSetIds,
			embeddingCoverage: coverage.coveragePercent,
		};
		if (bayesianStats) payload.bayesianStats = bayesianStats;

		// Empty working set short-circuits to ready-for-review with no proposals.
		if (workingSetIds.length < 2) {
			await transitionToNext(jobId, {
				phase: 'loading',
				nextStatus: 'ready-for-review',
				payload: { ...payload, proposals: [] },
				progress: {
					current: workingSetIds.length,
					total: workingSetIds.length,
					message: 'No eligible options after pre-filter — nothing to synthesize',
				},
			});

			return;
		}

		logger.info('asyncJob.loading.complete', {
			jobId,
			rawCount: raw.length,
			workingSetCount: workingSetIds.length,
		});

		await transitionToNext(jobId, {
			phase: 'loading',
			nextStatus: 'clustering',
			payload,
			progress: {
				current: workingSetIds.length,
				total: workingSetIds.length,
				message: `Loaded ${workingSetIds.length} eligible options`,
			},
		});
	} catch (error) {
		logger.warn('asyncJob.loading.failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
		await markFailed(jobId, error);
	}
}

/**
 * PHASE 2 — bulk in-memory UMAP+DBSCAN clustering. Reads `workingSetIds`,
 * fetches embeddings, calls `bulkClusterByEmbedding`, writes
 * `clusterAssignments` (only clusters with ≥2 members).
 */
export async function runClusteringPhase(jobId: string): Promise<void> {
	if (!(await claimPhase(jobId, 'clustering'))) return;
	try {
		const job = await getJob(jobId);
		if (!job) return;
		const workingSetIds = job.workingSetIds ?? [];
		if (workingSetIds.length < 2) {
			await transitionToNext(jobId, {
				phase: 'clustering',
				nextStatus: 'ready-for-review',
				payload: { proposals: [] },
				progress: { current: 0, total: 0, message: 'No options to cluster' },
			});

			return;
		}

		await heartbeat(jobId, 'Loading embeddings for clustering');
		const embeddingsMap = await embeddingCache.getBatchEmbeddings(workingSetIds);
		const items = workingSetIds
			.map((id) => {
				const e = embeddingsMap.get(id);

				return e ? { id, embedding: e } : null;
			})
			.filter((x): x is { id: string; embedding: number[] } => x !== null);

		if (items.length < 2) {
			await transitionToNext(jobId, {
				phase: 'clustering',
				nextStatus: 'ready-for-review',
				payload: { clusterAssignments: [], proposals: [] },
				progress: {
					current: items.length,
					total: workingSetIds.length,
					message: `Only ${items.length}/${workingSetIds.length} options have embeddings — nothing to cluster`,
				},
			});

			return;
		}

		await heartbeat(jobId, `Clustering ${items.length} options`);
		const { clusters, stats } = bulkClusterByEmbedding(items);
		const assignments: JobClusterAssignment[] = clusters
			.filter((c) => c.memberIds.length >= 2)
			.map((c, i) => ({ clusterId: `cluster-${i}`, memberIds: c.memberIds }));

		logger.info('asyncJob.clustering.complete', {
			jobId,
			itemCount: items.length,
			clusterCount: assignments.length,
			noiseCount: stats.noiseCount,
			durationMs: stats.durationMs,
		});

		await transitionToNext(jobId, {
			phase: 'clustering',
			nextStatus: assignments.length > 0 ? 'verifying' : 'ready-for-review',
			payload: assignments.length > 0 ? { clusterAssignments: assignments } : { proposals: [] },
			progress: {
				current: assignments.length,
				total: assignments.length,
				message: `Found ${assignments.length} candidate clusters`,
			},
		});
	} catch (error) {
		logger.warn('asyncJob.clustering.failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
		await markFailed(jobId, error);
	}
}

/**
 * PHASE 3 — two-tier (cosine bands + medoid LLM) verification. Reads
 * `clusterAssignments`, fetches per-member text + embedding, calls
 * `twoTierJudge`, writes `verifiedClusters`.
 */
export async function runVerifyingPhase(jobId: string): Promise<void> {
	if (!(await claimPhase(jobId, 'verifying'))) return;
	try {
		const job = await getJob(jobId);
		if (!job) return;
		const candidates = job.clusterAssignments ?? [];
		if (candidates.length === 0) {
			await transitionToNext(jobId, {
				phase: 'verifying',
				nextStatus: 'ready-for-review',
				payload: { verifiedClusters: [], proposals: [] },
				progress: { current: 0, total: 0, message: 'No clusters to verify' },
			});

			return;
		}

		// Collect every member id across all candidates so we batch-fetch
		// texts + embeddings exactly once.
		const memberIdSet = new Set<string>();
		for (const c of candidates) for (const id of c.memberIds) memberIdSet.add(id);
		const memberIds = [...memberIdSet];

		await heartbeat(jobId, `Loading ${memberIds.length} member embeddings`);
		const embeddingsMap = await embeddingCache.getBatchEmbeddings(memberIds);

		// Fetch texts in batched in-queries (Firestore 'in' caps at 30).
		const textMap = new Map<string, string>();
		const BATCH = 30;
		for (let i = 0; i < memberIds.length; i += BATCH) {
			const slice = memberIds.slice(i, i + BATCH);
			const snap = await db()
				.collection(Collections.statements)
				.where('statementId', 'in', slice)
				.get();
			snap.docs.forEach((d) => {
				const data = d.data() as Statement;
				if (data.statementId && data.statement) textMap.set(data.statementId, data.statement);
			});
			if (i % (BATCH * 5) === 0) {
				await heartbeat(
					jobId,
					`Fetched ${Math.min(i + BATCH, memberIds.length)}/${memberIds.length} member texts`,
				);
			}
		}

		const members = new Map<string, ClusterMember>();
		for (const id of memberIds) {
			const text = textMap.get(id);
			const embedding = embeddingsMap.get(id);
			if (!text || !embedding) continue;
			members.set(id, { id, text, embedding });
		}

		await heartbeat(jobId, `Verifying ${candidates.length} clusters`);
		const judgeResult = await twoTierJudge(candidates, members, {
			maxLlmCalls: Math.min(2000, Math.ceil(memberIds.length * 0.2)),
		});

		const verified: JobVerifiedCluster[] = [
			...judgeResult.verifiedClusters,
			...judgeResult.refinedFromDissent,
		].map((c) => ({
			clusterId: c.clusterId,
			memberIds: c.memberIds,
			medoidId: c.medoidId,
			verifiedBy: c.verifiedBy,
		}));

		logger.info('asyncJob.verifying.complete', {
			jobId,
			candidateCount: candidates.length,
			verifiedCount: judgeResult.verifiedClusters.length,
			refinedFromDissentCount: judgeResult.refinedFromDissent.length,
			llmCallsMade: judgeResult.stats.llmCallsMade,
			llmCallsCapped: judgeResult.stats.llmCallsCapped,
		});

		await transitionToNext(jobId, {
			phase: 'verifying',
			nextStatus: verified.length > 0 ? 'proposing' : 'ready-for-review',
			payload: verified.length > 0 ? { verifiedClusters: verified } : { proposals: [] },
			progress: {
				current: verified.length,
				total: candidates.length,
				message: `Verified ${verified.length}/${candidates.length} clusters`,
			},
		});
	} catch (error) {
		logger.warn('asyncJob.verifying.failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
		await markFailed(jobId, error);
	}
}

/**
 * PHASE 4 — Anthropic proposal generation per verified cluster. Reads
 * `verifiedClusters`, fetches the parent question for context, fans out
 * `generateSynthesizedProposal` per cluster, writes `proposals`.
 *
 * Falls back to the longest-text heuristic when the LLM refuses or errors,
 * so the admin always gets something to review.
 */
export async function runProposingPhase(jobId: string): Promise<void> {
	if (!(await claimPhase(jobId, 'proposing'))) return;
	try {
		const job = await getJob(jobId);
		if (!job) return;
		const clusters = job.verifiedClusters ?? [];
		if (clusters.length === 0) {
			await transitionToNext(jobId, {
				phase: 'proposing',
				nextStatus: 'ready-for-review',
				payload: { proposals: [] },
				progress: { current: 0, total: 0, message: 'No clusters to propose' },
			});

			return;
		}

		const parentDoc = await db().collection(Collections.statements).doc(job.questionId).get();
		const parentStatement = parentDoc.exists ? (parentDoc.data() as Statement) : null;
		const questionContext = parentStatement?.statement || job.questionId;

		// Gather member texts + metrics in a single batched fetch.
		const memberIdSet = new Set<string>();
		for (const c of clusters) for (const id of c.memberIds) memberIdSet.add(id);
		const memberIds = [...memberIdSet];
		const optionMap = new Map<string, OptionLite>();
		const BATCH = 30;
		for (let i = 0; i < memberIds.length; i += BATCH) {
			const slice = memberIds.slice(i, i + BATCH);
			const snap = await db()
				.collection(Collections.statements)
				.where('statementId', 'in', slice)
				.get();
			snap.docs.forEach((d) => {
				const data = d.data() as Statement;
				if (!data.statementId || !data.statement) return;
				optionMap.set(data.statementId, {
					statementId: data.statementId,
					statement: data.statement,
					consensus: data.consensus ?? 0,
					numberOfEvaluators: data.evaluation?.numberOfEvaluators ?? 0,
				});
			});
		}

		await heartbeat(jobId, `Generating proposals for ${clusters.length} clusters`);
		const proposals: JobProposal[] = await Promise.all(
			clusters.map(async (cluster, idx): Promise<JobProposal> => {
				const groupId = `group-${idx}`;
				const llmInputs: StatementWithEvaluation[] = cluster.memberIds.map((id) => {
					const m = optionMap.get(id);

					return {
						statementId: id,
						statement: m?.statement ?? '',
						paragraphsText: '',
						numberOfEvaluators: m?.numberOfEvaluators ?? 0,
						consensus: m?.consensus ?? 0,
						sumEvaluations: 0,
					};
				});
				try {
					const proposal = await generateSynthesizedProposal(llmInputs, questionContext);
					if (proposal.cannotSynthesize === true) {
						return {
							groupId,
							memberIds: cluster.memberIds,
							suggestedTitle: '',
							suggestedDescription: '',
							suggestedParagraphs: [],
							reasons: [],
							cannotSynthesize: true,
							splitReason: proposal.reason,
							splitProposal: proposal.splitProposal,
						};
					}

					return {
						groupId,
						memberIds: cluster.memberIds,
						suggestedTitle: proposal.title,
						suggestedDescription: proposal.description,
						suggestedParagraphs: proposal.paragraphs,
						reasons: [],
					};
				} catch (error) {
					logger.warn('asyncJob.proposing: per-cluster proposal failed (fallback to heuristic)', {
						jobId,
						groupId,
						error: error instanceof Error ? error.message : String(error),
					});
					const memberTexts = cluster.memberIds
						.map((id) => optionMap.get(id)?.statement ?? '')
						.filter((t) => t.length > 0);
					const sorted = [...memberTexts].sort((a, b) => b.length - a.length);

					return {
						groupId,
						memberIds: cluster.memberIds,
						suggestedTitle: sorted[0] ?? '',
						suggestedDescription: sorted.slice(1).join('\n\n'),
						suggestedParagraphs: [],
						reasons: [],
					};
				}
			}),
		);

		logger.info('asyncJob.proposing.complete', {
			jobId,
			proposalCount: proposals.length,
		});

		await transitionToNext(jobId, {
			phase: 'proposing',
			nextStatus: 'ready-for-review',
			payload: { proposals },
			progress: {
				current: proposals.length,
				total: proposals.length,
				message: `Synthesized ${proposals.length} proposals — ready for review`,
			},
		});
	} catch (error) {
		logger.warn('asyncJob.proposing.failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
		await markFailed(jobId, error);
	}
}

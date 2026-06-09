import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, Role, Statement, StatementType, functionConfig } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { ALLOWED_ORIGINS } from './config/cors';
import { embeddingCache } from './services/embedding-cache-service';
import { buildCandidateEdges } from './services/similarity-grouping-service';
import { EquivalenceVerdict, EquivalencePair } from './services/semantic-equivalence-service';
import { judgeSemanticEquivalenceCached } from './services/verdict-cache-service';
import { UnionFind } from './utils/unionFind';
import { refineComponent, pairKey } from './synthesis/completeLinkage';
import { performIntegration } from './integrate/performIntegration';
import { dissolveQuestionSynthesis } from './synthesis/derivedDocs';
import { recomputeClusterEvaluation } from './condensation/aggregation';
import {
	generateSynthesizedProposal,
	StatementWithEvaluation,
} from './services/integration-ai-service';
// Ship 1 modules — only invoked when the corresponding feature flags are ON.
// See `synthesis/featureFlags.ts` for the env-var gate. Existing pipeline
// behavior is preserved when flags are OFF.
import { bayesianFilterOptions } from './synthesis/scoring';
import { buildCandidateClusters } from './synthesis/candidateClusters';
import { twoTierJudge, type ClusterMember } from './synthesis/twoTierJudge';
import { synthesisFlags, shouldUseBulkSynthesisPath } from './synthesis/featureFlags';

/**
 * Bulk Idea Synthesis — admin-triggered pipeline that detects and merges
 * near-duplicate proposals under a question.
 *
 * Two callables:
 *   - `synthesizeIdeasPreview`: runs phases 1–6 of the pipeline and returns
 *     candidate groups for admin review. No writes beyond the run metadata.
 *   - `synthesizeIdeasExecute`: receives admin-confirmed groups and applies
 *     each via `performIntegration` (same merge primitive as the per-idea
 *     integration flow).
 *
 * See docs/clusters and synthesis/clustering-and-synthesis-paper.md §5 for the algorithm.
 */

const DEFAULT_THRESHOLD = 0.9;
const REQUIRED_EMBEDDING_COVERAGE = 90;

interface SynthesisFilters {
	minAverage?: number;
	minConsensus?: number;
	minEvaluators?: number;
}

interface PreviewRequest {
	parentStatementId: string;
	threshold?: number;
	filters?: SynthesisFilters;
}

interface PreviewGroup {
	groupId: string; // unique id within the run; used by the execute call
	memberIds: string[];
	memberPreviews: Array<{ id: string; statement: string }>;
	suggestedTitle: string;
	suggestedDescription: string;
	/**
	 * Multi-paragraph plan written by the synthesis-proposal LLM. When
	 * non-empty, the execute call will create paragraph child Statements.
	 * Empty arrays are valid (heuristic fallback returns just title +
	 * description).
	 */
	suggestedParagraphs: string[];
	reasons: string[];
	/**
	 * Set when the synthesis-proposal LLM refused to merge this group
	 * because the inputs span fundamentally different solution directions
	 * (e.g. raise-X vs lower-X). The admin UI should surface this as
	 * "can't synthesize as one — split into N?".
	 */
	cannotSynthesize?: boolean;
	splitReason?: string;
	splitProposal?: string[][];
}

interface PreviewResponse {
	status: 'ready' | 'needs-embeddings' | 'no-candidates';
	parentStatementId: string;
	threshold: number;
	filters: SynthesisFilters;
	embeddingCoverage: number;
	inputCount: number;
	candidateEdgeCount: number;
	verifiedSameEdgeCount: number;
	groups: PreviewGroup[];
}

interface ExecuteRequest {
	parentStatementId: string;
	threshold: number;
	filters: SynthesisFilters;
	confirmedGroups: Array<{
		memberIds: string[];
		mergedTitle: string;
		mergedDescription: string;
		/**
		 * Optional rich body. When provided, performIntegration writes
		 * paragraph child Statements per the project's "paragraphs are
		 * child Statements" rule.
		 */
		paragraphs?: string[];
	}>;
}

interface ExecuteResponse {
	success: true;
	createdCount: number;
	createdStatementIds: string[];
}

async function assertAdmin(parentStatementId: string, userId: string): Promise<Statement> {
	const db = getFirestore();
	const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
	if (!parentDoc.exists) {
		throw new HttpsError('not-found', 'Parent statement not found');
	}
	const parentStatement = parentDoc.data() as Statement;
	const topParentId = parentStatement.topParentId || parentStatementId;

	const membersSnapshot = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', topParentId)
		.where('userId', '==', userId)
		.where('role', 'in', [Role.admin, 'creator', 'admin'])
		.limit(1)
		.get();

	if (membersSnapshot.empty) {
		throw new HttpsError('permission-denied', 'Only admins can run idea synthesis');
	}

	return parentStatement;
}

interface OptionWithMetrics {
	statementId: string;
	statement: string;
	averageEvaluation: number;
	consensus: number;
	numberOfEvaluators: number;
}

async function loadEligibleOptions(
	parentStatementId: string,
	filters: SynthesisFilters,
): Promise<OptionWithMetrics[]> {
	const db = getFirestore();
	const snapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentStatementId)
		.where('statementType', '==', StatementType.option)
		.get();

	const options: OptionWithMetrics[] = [];
	for (const doc of snapshot.docs) {
		const data = doc.data() as Statement;
		if (data.hide === true) continue;
		if (data.isCluster === true) continue;
		if (!data.statementId || !data.statement) continue;

		const averageEvaluation = data.evaluation?.averageEvaluation ?? 0;
		const numberOfEvaluators = data.evaluation?.numberOfEvaluators ?? 0;
		const consensus = data.consensus ?? 0;

		if (filters.minAverage !== undefined && averageEvaluation < filters.minAverage) continue;
		if (filters.minConsensus !== undefined && consensus < filters.minConsensus) continue;
		if (filters.minEvaluators !== undefined && numberOfEvaluators < filters.minEvaluators) continue;

		options.push({
			statementId: data.statementId,
			statement: data.statement,
			averageEvaluation,
			consensus,
			numberOfEvaluators,
		});
	}

	return options;
}

function pickSuggestedTitle(memberTexts: string[]): { title: string; description: string } {
	if (memberTexts.length === 0) return { title: '', description: '' };
	// v1 heuristic: longest text becomes the title; the rest become descriptions.
	// LLM-driven canonical title generation is deferred to a follow-up.
	const sorted = [...memberTexts].sort((a, b) => b.length - a.length);

	return {
		title: sorted[0],
		description: sorted.slice(1).join('\n\n'),
	};
}

async function recordRunMetadata(
	parentStatementId: string,
	runId: string,
	threshold: number,
	filters: SynthesisFilters,
	inputCount: number,
	candidateEdgeCount: number,
	groupsCreated: number,
	status: 'awaiting-confirmation' | 'complete' | 'error',
	userId: string,
	error?: string,
): Promise<void> {
	const db = getFirestore();
	await db
		.collection(Collections.statements)
		.doc(parentStatementId)
		.update({
			synthesisRun: {
				lastRunAt: Date.now(),
				lastRunBy: userId,
				threshold,
				filters,
				inputCount,
				candidateEdgeCount,
				groupsCreated,
				runId,
				status,
				...(error ? { error } : {}),
			},
		});
}

export const synthesizeIdeasPreview = onCall<PreviewRequest>(
	{
		timeoutSeconds: 540,
		// Bumped 1GiB → 2GiB in Ship 1: the bulk in-memory clustering path
		// (UMAP+HDBSCAN over working-set embeddings) needs the headroom and,
		// more importantly, the extra CPU that comes proportional to memory
		// (1 GiB ≈ 1 vCPU, 2 GiB ≈ 1.6 vCPU). This is *not* a workaround for
		// the timeout — the structural fix lands in the same change. See
		// plans/synthesis-100k-living-synth.md, Ship 1 §"Memory & timeout knobs".
		memory: '2GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<PreviewResponse> => {
		const userId = request.auth?.uid;
		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { parentStatementId } = request.data;
		if (!parentStatementId) {
			throw new HttpsError('invalid-argument', 'parentStatementId is required');
		}

		const threshold = request.data.threshold ?? DEFAULT_THRESHOLD;
		const filters: SynthesisFilters = request.data.filters ?? {};

		const parentStatement = await assertAdmin(parentStatementId, userId);

		// Phase 1: pre-flight coverage
		const coverage = await embeddingCache.getEmbeddingCoverage(parentStatementId);
		if (coverage.coveragePercent < REQUIRED_EMBEDDING_COVERAGE) {
			return {
				status: 'needs-embeddings',
				parentStatementId,
				threshold,
				filters,
				embeddingCoverage: coverage.coveragePercent,
				inputCount: 0,
				candidateEdgeCount: 0,
				verifiedSameEdgeCount: 0,
				groups: [],
			};
		}

		// Phase 2: pre-filter
		const rawEligibleOptions = await loadEligibleOptions(parentStatementId, filters);

		// Phase 2b (flag-gated): Bayesian-shrunk pre-filter narrows the working
		// set to confident-good options only. At scale the long tail of single-
		// evaluator outliers dominates the input; shrinking toward the global
		// prior keeps high-evidence options and drops loud-thin ones.
		// See `synthesis/scoring.ts` for the math.
		let eligibleOptions = rawEligibleOptions;
		if (synthesisFlags.bayesianPrefilter && rawEligibleOptions.length > 0) {
			// bayesianFilterOptions consumes Statement-shaped objects. The
			// OptionWithMetrics fields it reads (consensus, evaluation.numberOfEvaluators)
			// are present and correctly typed via duck-typing, so a shape cast is safe.
			const filterStatements = rawEligibleOptions.map((o) => ({
				statementId: o.statementId,
				statement: o.statement,
				consensus: o.consensus,
				evaluation: { numberOfEvaluators: o.numberOfEvaluators, agreement: o.consensus },
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			})) as any;
			const filterResult = bayesianFilterOptions(filterStatements);
			const keptIds = new Set(filterResult.kept.map((s) => s.statement.statementId));
			eligibleOptions = rawEligibleOptions.filter((o) => keptIds.has(o.statementId));
			logger.info('synthesizeIdeasPreview.bayesianPrefilter', {
				inputCount: rawEligibleOptions.length,
				keptCount: eligibleOptions.length,
				prior: filterResult.stats.prior,
				sigma: filterResult.stats.sigma,
				cutoff: filterResult.stats.cutoff,
			});
		}

		if (eligibleOptions.length < 2) {
			return {
				status: 'no-candidates',
				parentStatementId,
				threshold,
				filters,
				embeddingCoverage: coverage.coveragePercent,
				inputCount: eligibleOptions.length,
				candidateEdgeCount: 0,
				verifiedSameEdgeCount: 0,
				groups: [],
			};
		}

		const idToText = new Map<string, string>();
		for (const opt of eligibleOptions) {
			idToText.set(opt.statementId, opt.statement);
		}

		// Phase 3: candidate edges from embedding ANN
		const candidateIds = eligibleOptions.map((o) => o.statementId);

		// Ship 1 fast path: bulk in-memory clustering + two-tier (cosine bands +
		// medoid LLM) judge. Replaces the legacy N-anchor `findNearest` plus
		// all-pairs LLM verification (Phases 3–6) in one in-process pass.
		// Both flags must be ON together (see `shouldUseBulkSynthesisPath`).
		// When either is OFF, the legacy path runs unchanged.
		if (shouldUseBulkSynthesisPath()) {
			const bulkPathStart = Date.now();
			const embeddingsMap = await embeddingCache.getBatchEmbeddings(candidateIds);
			const items = candidateIds
				.map((id) => {
					const e = embeddingsMap.get(id);

					return e ? { id, embedding: e } : null;
				})
				.filter((x): x is { id: string; embedding: number[] } => x !== null);

			if (items.length < 2) {
				logger.info('synthesizeIdeasPreview.bulkPath.noEmbeddings', {
					candidateCount: candidateIds.length,
					itemsWithEmbeddings: items.length,
				});
				const runId = getFirestore().collection('_').doc().id;
				await recordRunMetadata(
					parentStatementId,
					runId,
					threshold,
					filters,
					eligibleOptions.length,
					0,
					0,
					'complete',
					userId,
				);

				return {
					status: 'no-candidates',
					parentStatementId,
					threshold,
					filters,
					embeddingCoverage: coverage.coveragePercent,
					inputCount: eligibleOptions.length,
					candidateEdgeCount: 0,
					verifiedSameEdgeCount: 0,
					groups: [],
				};
			}

			// Candidate clusters by ANN cosine edges + connected components (the
			// live path's geometry), NOT UMAP→DBSCAN. Preserves singletons —
			// distinct ideas are left standalone instead of forced into buckets.
			const { clusters: candidateClusters } = await buildCandidateClusters(
				items.map((it) => it.id),
				{ parentId: parentStatementId, threshold },
			);

			const members = new Map<string, ClusterMember>();
			for (const item of items) {
				members.set(item.id, {
					id: item.id,
					text: idToText.get(item.id) ?? '',
					embedding: item.embedding,
				});
			}

			const judgeResult = await twoTierJudge(candidateClusters, members, {
				maxLlmCalls: Math.min(2000, Math.ceil(eligibleOptions.length * 0.2)),
			});

			// Telemetry to keep PreviewResponse shape compatible with the legacy
			// path. Edge counts here are derived from cluster sizes (intra-cluster
			// pairs) since we never built an explicit edge list.
			const candidateEdgeCount = candidateClusters.reduce(
				(acc, c) => acc + (c.memberIds.length * (c.memberIds.length - 1)) / 2,
				0,
			);
			const allVerified = [...judgeResult.verifiedClusters, ...judgeResult.refinedFromDissent];
			const refinedGroupsBulk = allVerified.map((c) => c.memberIds);
			const verifiedSameEdgeCount = refinedGroupsBulk.reduce(
				(acc, g) => acc + (g.length * (g.length - 1)) / 2,
				0,
			);

			logger.info('synthesizeIdeasPreview.bulkPath.complete', {
				inputCount: eligibleOptions.length,
				itemsWithEmbeddings: items.length,
				candidateClusterCount: candidateClusters.length,
				verifiedClusterCount: judgeResult.verifiedClusters.length,
				refinedFromDissentCount: judgeResult.refinedFromDissent.length,
				llmCallsMade: judgeResult.stats.llmCallsMade,
				llmCallsCapped: judgeResult.stats.llmCallsCapped,
				durationMs: Date.now() - bulkPathStart,
			});

			if (refinedGroupsBulk.length === 0) {
				const runId = getFirestore().collection('_').doc().id;
				await recordRunMetadata(
					parentStatementId,
					runId,
					threshold,
					filters,
					eligibleOptions.length,
					candidateEdgeCount,
					0,
					'complete',
					userId,
				);

				return {
					status: 'no-candidates',
					parentStatementId,
					threshold,
					filters,
					embeddingCoverage: coverage.coveragePercent,
					inputCount: eligibleOptions.length,
					candidateEdgeCount,
					verifiedSameEdgeCount: 0,
					groups: [],
				};
			}

			// Phase 7 (proposal generation) is unchanged below — it consumes
			// `refinedGroups`. Bridge the bulk-path output into the same name
			// so the rest of the function flows identically. The bulk path
			// doesn't surface per-pair "reasons" (it judges medoid-anchored,
			// not all-pairs), so the reasonsByGroup map stays empty here.
			const refinedGroups = refinedGroupsBulk;
			const reasonsByGroup = new Map<string[], string[]>();
			const eligibleById = new Map<string, OptionWithMetrics>();
			for (const o of eligibleOptions) eligibleById.set(o.statementId, o);
			const questionContext = parentStatement.statement || parentStatement.statementId;

			const groups: PreviewGroup[] = await Promise.all(
				refinedGroups.map(async (memberIds, idx) => {
					const groupId = `group-${idx}`;
					const memberPreviews = memberIds.map((id) => ({
						id,
						statement: idToText.get(id) || '',
					}));
					const reasons = reasonsByGroup.get(memberIds) || [];

					const llmInputs: StatementWithEvaluation[] = memberIds.map((id) => {
						const m = eligibleById.get(id);

						return {
							statementId: id,
							statement: m?.statement ?? idToText.get(id) ?? '',
							paragraphsText: '',
							numberOfEvaluators: m?.numberOfEvaluators ?? 0,
							consensus: m?.consensus ?? 0,
							sumEvaluations: 0,
						};
					});

					try {
						const proposal = await generateSynthesizedProposal(llmInputs, questionContext);

						if (proposal.cannotSynthesize === true) {
							const memberTexts = memberIds
								.map((id) => idToText.get(id) || '')
								.filter((t) => t.length > 0);
							const fallback = pickSuggestedTitle(memberTexts);

							return {
								groupId,
								memberIds,
								memberPreviews,
								suggestedTitle: fallback.title,
								suggestedDescription: fallback.description,
								suggestedParagraphs: [],
								reasons,
								cannotSynthesize: true,
								splitReason: proposal.reason,
								splitProposal: proposal.splitProposal,
							};
						}

						return {
							groupId,
							memberIds,
							memberPreviews,
							suggestedTitle: proposal.title,
							suggestedDescription: proposal.description,
							suggestedParagraphs: proposal.paragraphs,
							reasons,
						};
					} catch (error) {
						logger.error('synthesizeIdeasPreview: proposal generation failed (bulk path)', {
							groupId,
							error: error instanceof Error ? error.message : String(error),
						});
						const memberTexts = memberIds
							.map((id) => idToText.get(id) || '')
							.filter((t) => t.length > 0);
						const fallback = pickSuggestedTitle(memberTexts);

						return {
							groupId,
							memberIds,
							memberPreviews,
							suggestedTitle: fallback.title,
							suggestedDescription: fallback.description,
							suggestedParagraphs: [],
							reasons,
						};
					}
				}),
			);

			const runId = getFirestore().collection('_').doc().id;
			await recordRunMetadata(
				parentStatementId,
				runId,
				threshold,
				filters,
				eligibleOptions.length,
				candidateEdgeCount,
				groups.length,
				'awaiting-confirmation',
				userId,
			);

			logger.info('synthesizeIdeasPreview completed (bulk path)', {
				parentStatementId,
				inputCount: eligibleOptions.length,
				candidateEdgeCount,
				verifiedSameEdgeCount,
				groupCount: groups.length,
			});

			return {
				status: 'ready',
				parentStatementId,
				threshold,
				filters,
				embeddingCoverage: coverage.coveragePercent,
				inputCount: eligibleOptions.length,
				candidateEdgeCount,
				verifiedSameEdgeCount,
				groups,
			};
		}

		const candidateEdges = await buildCandidateEdges(candidateIds, {
			parentId: parentStatementId,
			threshold,
		});

		if (candidateEdges.length === 0) {
			const runId = getFirestore().collection('_').doc().id;
			await recordRunMetadata(
				parentStatementId,
				runId,
				threshold,
				filters,
				eligibleOptions.length,
				0,
				0,
				'complete',
				userId,
			);

			return {
				status: 'no-candidates',
				parentStatementId,
				threshold,
				filters,
				embeddingCoverage: coverage.coveragePercent,
				inputCount: eligibleOptions.length,
				candidateEdgeCount: 0,
				verifiedSameEdgeCount: 0,
				groups: [],
			};
		}

		// Phase 4: LLM-as-judge — verify every candidate edge
		const equivalencePairs: EquivalencePair[] = candidateEdges
			.map((edge) => {
				const textA = idToText.get(edge.a);
				const textB = idToText.get(edge.b);
				if (!textA || !textB) return null;

				return { pairId: pairKey(edge.a, edge.b), textA, textB };
			})
			.filter((p): p is EquivalencePair => p !== null);

		const verdictResults = await judgeSemanticEquivalenceCached(equivalencePairs);
		const verdictMap = new Map<string, EquivalenceVerdict>();
		const reasonMap = new Map<string, string>();
		for (const r of verdictResults) {
			verdictMap.set(r.pairId, r.verdict);
			reasonMap.set(r.pairId, r.reason);
		}

		const verifiedSameEdges = candidateEdges.filter(
			(edge) => verdictMap.get(pairKey(edge.a, edge.b)) === 'same',
		);

		// Phase 5: union-find on verified-same edges
		const uf = new UnionFind();
		for (const id of candidateIds) uf.add(id);
		for (const edge of verifiedSameEdges) {
			uf.union(edge.a, edge.b);
		}
		const components = uf.components().filter((c) => c.length >= 2);

		// Phase 6: complete-linkage refinement
		const refinedGroups: string[][] = [];
		const reasonsByGroup = new Map<string[], string[]>();
		for (const component of components) {
			const refined = await refineComponent(
				{
					memberIds: component,
					texts: idToText,
					verdicts: verdictMap,
				},
				(missingPairs) => judgeSemanticEquivalenceCached(missingPairs),
			);
			// Merge any newly-fetched verdicts into the run-level map for reason lookup
			for (const r of refined.newVerdicts) {
				verdictMap.set(r.pairId, r.verdict);
				reasonMap.set(r.pairId, r.reason);
			}
			for (const clique of refined.cliques) {
				refinedGroups.push(clique);
				const reasons: string[] = [];
				for (let i = 0; i < clique.length; i++) {
					for (let j = i + 1; j < clique.length; j++) {
						const reason = reasonMap.get(pairKey(clique[i], clique[j]));
						if (reason) reasons.push(reason);
					}
				}
				reasonsByGroup.set(clique, Array.from(new Set(reasons)).slice(0, 3));
			}
		}

		// Phase 7 (preview): generate a SYNTHESIZED PROPOSAL per group via the
		// proposal-style LLM (proposal-first, with directional-coherence check).
		// We pass full evaluation metrics so the LLM can weight inputs by
		// community support. If the LLM refuses (cannotSynthesize), the
		// PreviewGroup is emitted with the split metadata so the admin UI can
		// surface "split into N?" rather than synthesize across directions.
		// On any other AI error we fall back to the legacy heuristic so the
		// preview always succeeds — the admin can still edit before commit.
		const eligibleById = new Map<string, OptionWithMetrics>();
		for (const o of eligibleOptions) eligibleById.set(o.statementId, o);

		const questionContext = parentStatement.statement || parentStatement.statementId;

		const groups: PreviewGroup[] = await Promise.all(
			refinedGroups.map(async (memberIds, idx) => {
				const groupId = `group-${idx}`;
				const memberPreviews = memberIds.map((id) => ({
					id,
					statement: idToText.get(id) || '',
				}));
				const reasons = reasonsByGroup.get(memberIds) || [];

				// Build the rich payload for the synthesis LLM.
				const llmInputs: StatementWithEvaluation[] = memberIds.map((id) => {
					const m = eligibleById.get(id);

					return {
						statementId: id,
						statement: m?.statement ?? idToText.get(id) ?? '',
						paragraphsText: '',
						numberOfEvaluators: m?.numberOfEvaluators ?? 0,
						consensus: m?.consensus ?? 0,
						sumEvaluations: 0,
					};
				});

				try {
					const proposal = await generateSynthesizedProposal(llmInputs, questionContext);

					if (proposal.cannotSynthesize === true) {
						const memberTexts = memberIds
							.map((id) => idToText.get(id) || '')
							.filter((t) => t.length > 0);
						const fallback = pickSuggestedTitle(memberTexts);

						return {
							groupId,
							memberIds,
							memberPreviews,
							suggestedTitle: fallback.title,
							suggestedDescription: fallback.description,
							suggestedParagraphs: [],
							reasons,
							cannotSynthesize: true,
							splitReason: proposal.reason,
							splitProposal: proposal.splitProposal,
						};
					}

					return {
						groupId,
						memberIds,
						memberPreviews,
						suggestedTitle: proposal.title,
						suggestedDescription: proposal.description,
						suggestedParagraphs: proposal.paragraphs,
						reasons,
					};
				} catch (error) {
					logger.error('synthesizeIdeasPreview: proposal generation failed, using heuristic', {
						groupId,
						error: error instanceof Error ? error.message : String(error),
					});
					const memberTexts = memberIds
						.map((id) => idToText.get(id) || '')
						.filter((t) => t.length > 0);
					const fallback = pickSuggestedTitle(memberTexts);

					return {
						groupId,
						memberIds,
						memberPreviews,
						suggestedTitle: fallback.title,
						suggestedDescription: fallback.description,
						suggestedParagraphs: [],
						reasons,
					};
				}
			}),
		);

		const runId = getFirestore().collection('_').doc().id;
		await recordRunMetadata(
			parentStatementId,
			runId,
			threshold,
			filters,
			eligibleOptions.length,
			candidateEdges.length,
			groups.length,
			'awaiting-confirmation',
			userId,
		);

		logger.info('synthesizeIdeasPreview completed', {
			parentStatementId,
			runId,
			inputCount: eligibleOptions.length,
			candidateEdgeCount: candidateEdges.length,
			verifiedSameEdgeCount: verifiedSameEdges.length,
			groupCount: groups.length,
		});

		return {
			status: 'ready',
			parentStatementId,
			threshold,
			filters,
			embeddingCoverage: coverage.coveragePercent,
			inputCount: eligibleOptions.length,
			candidateEdgeCount: candidateEdges.length,
			verifiedSameEdgeCount: verifiedSameEdges.length,
			groups,
		};
	},
);

export const synthesizeIdeasExecute = onCall<ExecuteRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ExecuteResponse> => {
		const userId = request.auth?.uid;
		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { parentStatementId, threshold, filters, confirmedGroups } = request.data;
		if (!parentStatementId) {
			throw new HttpsError('invalid-argument', 'parentStatementId is required');
		}
		if (!Array.isArray(confirmedGroups) || confirmedGroups.length === 0) {
			throw new HttpsError('invalid-argument', 'At least one confirmed group is required');
		}

		await assertAdmin(parentStatementId, userId);

		// Clean-then-rebuild: dissolve any prior synthesis output (restoring its
		// members) before applying the confirmed groups, so re-running execute is
		// idempotent and never stacks duplicate synths on top of old ones.
		const dissolved = await dissolveQuestionSynthesis(parentStatementId, {
			reversedByUserId: userId,
		});
		logger.info('synthesizeIdeasExecute.dissolvedPriorSynthesis', {
			parentStatementId,
			...dissolved,
		});

		const db = getFirestore();
		// One id per execute run — stamped on every cluster it creates so a later
		// run (or cleanup) can identify/remove exactly this run's output.
		const synthesisRunId = db.collection('_').doc().id;
		const adminDoc = await db.collection('usersV2').doc(userId).get();
		const adminData = adminDoc.exists ? adminDoc.data() : null;
		const creatorDisplayName = adminData?.displayName || 'Admin';
		const creatorDefaultLanguage = adminData?.defaultLanguage || 'en';

		const createdStatementIds: string[] = [];
		const errors: string[] = [];

		// Groups write independent docs (new cluster, paragraph children,
		// member hide updates) so they can run concurrently. Cap at 5 to
		// avoid overwhelming Firestore writes on a 1GiB instance.
		const integrationLimit = pLimit(5);
		await Promise.all<unknown>(
			confirmedGroups.map((group) =>
				integrationLimit(async () => {
					if (!Array.isArray(group.memberIds) || group.memberIds.length < 2) {
						errors.push('Skipped group with fewer than 2 members');

						return;
					}
					if (!group.mergedTitle || !group.mergedTitle.trim()) {
						errors.push('Skipped group with empty title');

						return;
					}

					try {
						const result = await performIntegration({
							parentStatementId,
							selectedStatementIds: group.memberIds,
							integratedTitle: group.mergedTitle,
							integratedDescription: group.mergedDescription || '',
							creatorId: userId,
							creatorDisplayName,
							creatorDefaultLanguage,
							derivedByPipeline: 'synthesis',
							synthesisRunId,
							synthesisMechanism: 'bulk',
							paragraphs: Array.isArray(group.paragraphs) ? group.paragraphs : undefined,
						});
						createdStatementIds.push(result.newStatementId);
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Group merge failed';
						logger.error('synthesizeIdeasExecute group merge failed', {
							error: message,
							group,
						});
						errors.push(message);
					}
				}),
			),
		);

		// End-of-run augmented-evaluation finalization.
		//
		// performIntegration → migrateEvaluationsToNewStatement already wrote
		// the per-user-deduplicated evaluation onto each new cluster. We
		// invoke `recomputeClusterEvaluation` here as the canonical
		// re-aggregation: it (a) confirms the truth invariant from a single
		// source of truth (paper §6.2), (b) syncs clusterEvaluationLinks
		// provenance, and (c) emits an audit log per cluster so the run
		// metadata can be cross-checked. Cost is O(K) reads/writes where K
		// is the number of created clusters (≤20 in typical workloads).
		const finalizeLimit = pLimit(5);
		await Promise.all(
			createdStatementIds.map((clusterId) =>
				finalizeLimit(async () => {
					try {
						const evaluation = await recomputeClusterEvaluation(clusterId);
						if (evaluation) {
							logger.info('synthesizeIdeasExecute.finalize', {
								clusterId,
								numberOfEvaluators: evaluation.numberOfEvaluators,
								consensus: evaluation.agreement,
								averageEvaluation: evaluation.averageEvaluation,
							});
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : 'finalize recompute failed';
						logger.warn('synthesizeIdeasExecute.finalize failed (non-fatal)', {
							clusterId,
							error: message,
						});
						errors.push(`finalize:${message}`);
					}
				}),
			),
		);

		const runId = db.collection('_').doc().id;
		await recordRunMetadata(
			parentStatementId,
			runId,
			threshold,
			filters,
			0,
			0,
			createdStatementIds.length,
			errors.length > 0 ? 'error' : 'complete',
			userId,
			errors.length > 0 ? errors.join('; ') : undefined,
		);

		return {
			success: true,
			createdCount: createdStatementIds.length,
			createdStatementIds,
		};
	},
);

interface RegenerateProposalRequest {
	clusterStatementId: string;
}

interface RegenerateProposalResponse {
	success: boolean;
	clusterStatementId: string;
	cannotSynthesize?: boolean;
	splitReason?: string;
	splitProposal?: string[][];
	title?: string;
	description?: string;
	paragraphChildrenCreated?: number;
}

/**
 * Re-runs the synthesis-proposal LLM on an existing synthesis cluster and
 * replaces its title, description, and paragraph children atomically.
 *
 * Use case: an admin wants a freshly-drafted proposal — either because the
 * source ideas have moved on, or because the cluster was synthesized by a
 * legacy heuristic and reads as a paraphrase rather than a proposal.
 *
 * If the LLM refuses to synthesize (directional conflict), the call returns
 * the split metadata without touching Firestore.
 */
export const regenerateSynthesisProposal = onCall<RegenerateProposalRequest>(
	{
		timeoutSeconds: 120,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<RegenerateProposalResponse> => {
		const userId = request.auth?.uid;
		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { clusterStatementId } = request.data;
		if (!clusterStatementId) {
			throw new HttpsError('invalid-argument', 'clusterStatementId is required');
		}

		const db = getFirestore();
		const clusterDoc = await db.collection(Collections.statements).doc(clusterStatementId).get();
		if (!clusterDoc.exists) {
			throw new HttpsError('not-found', 'Cluster not found');
		}
		const cluster = clusterDoc.data() as Statement;
		if (cluster.isCluster !== true) {
			throw new HttpsError('failed-precondition', 'Statement is not a cluster');
		}

		const parentStatementId = cluster.parentId;
		if (!parentStatementId) {
			throw new HttpsError('failed-precondition', 'Cluster has no parent context');
		}
		const parentStatement = await assertAdmin(parentStatementId, userId);

		const integrated = cluster.integratedOptions ?? [];
		if (integrated.length === 0) {
			throw new HttpsError(
				'failed-precondition',
				'Cluster has no integratedOptions to regenerate from',
			);
		}

		const llmInputs: StatementWithEvaluation[] = [];
		for (const id of integrated) {
			const doc = await db.collection(Collections.statements).doc(id).get();
			if (!doc.exists) continue;
			const data = doc.data() as Statement;
			llmInputs.push({
				statementId: id,
				statement: data.statement || '',
				paragraphsText: '',
				numberOfEvaluators: data.evaluation?.numberOfEvaluators ?? 0,
				consensus: data.consensus ?? data.evaluation?.agreement ?? 0,
				sumEvaluations: data.evaluation?.sumEvaluations ?? 0,
			});
		}
		if (llmInputs.length === 0) {
			throw new HttpsError('failed-precondition', 'No source statements found for this cluster');
		}

		const questionContext = parentStatement.statement || parentStatementId;
		const proposal = await generateSynthesizedProposal(llmInputs, questionContext);

		if (proposal.cannotSynthesize === true) {
			return {
				success: true,
				clusterStatementId,
				cannotSynthesize: true,
				splitReason: proposal.reason,
				splitProposal: proposal.splitProposal,
			};
		}

		const cachedDescription =
			proposal.paragraphs.find((p) => p.trim().length > 0)?.trim() ||
			proposal.description.trim() ||
			'';

		// Replace existing paragraph children atomically so the cluster never
		// holds two competing rich bodies. Old children are deleted; new ones
		// are created in the same batch alongside the cluster doc update.
		const existingParagraphsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', clusterStatementId)
			.where('statementType', '==', StatementType.paragraph)
			.get();

		const now = Date.now();
		const batch = db.batch();
		existingParagraphsSnap.forEach((d) => batch.delete(d.ref));

		let createdCount = 0;
		const parentParents = parentStatement.parents ?? [];
		proposal.paragraphs.forEach((text, idx) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const childId = db.collection(Collections.statements).doc().id;
			const childCreatedAt = now + idx;
			const child: Partial<Statement> & { statementId: string } = {
				statementId: childId,
				statement: trimmed,
				statementType: StatementType.paragraph,
				parentId: clusterStatementId,
				topParentId: cluster.topParentId || parentStatementId,
				parents: [...parentParents, parentStatementId, clusterStatementId],
				creatorId: userId,
				creator: cluster.creator ?? {
					uid: userId,
					displayName: 'Admin',
					defaultLanguage: 'en',
				},
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			};
			batch.set(db.collection(Collections.statements).doc(childId), child);
			createdCount++;
		});

		batch.update(clusterDoc.ref, {
			statement: proposal.title.trim(),
			description: cachedDescription,
			paragraphs: [],
			lastUpdate: now,
			lastChildUpdate: now,
		});

		await batch.commit();

		logger.info('regenerateSynthesisProposal: complete', {
			clusterStatementId,
			parentStatementId,
			paragraphChildrenCreated: createdCount,
			deletedExistingParagraphs: existingParagraphsSnap.size,
		});

		return {
			success: true,
			clusterStatementId,
			title: proposal.title.trim(),
			description: cachedDescription,
			paragraphChildrenCreated: createdCount,
		};
	},
);

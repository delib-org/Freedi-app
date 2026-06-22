import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { vectorSearchService } from '../../services/vector-search-service';
import { findClustersContainingMember } from '../liveSynth/clusterRecompute';
import { loadSynthesisSettingsFromStatement } from './loadSynthesisSettings';
import { ensureEmbedding } from './embedding';
import { expandClusterEvidenceViaFullMembers } from './candidateExpansion';
import { assessCohesion, passesCohesionGate, type CohesionGate } from './clusterCohesion';
import { routeByCosine } from './bandRouter';
import {
	attachOptionToCluster,
	isCluster,
	isSynth,
	isTopicCluster,
	queueForReview,
	spawnClusterFromPair,
} from './clusterOps';

/**
 * The one synthesis pipeline.
 *
 * Same function for the on-create trigger, the threshold-cross trigger, the
 * scheduled queue worker, "Synthesize now," and "Selective synthesis." One
 * decision tree, one place to change behavior.
 *
 * Cosine is a candidacy gate; the LLM is the synth-vs-cluster judge. This
 * makes the spawn decision robust to embedding-model drift (e.g. OpenAI
 * text-embedding-3-small puts real-world paraphrases at ~0.78, well below
 * any threshold a human would set for "near-duplicate").
 *
 * Each cluster in candidates gets a "best evidence" score = max(direct
 * cluster cosine, max member cosine for members also in candidates).
 * Transitive evidence via a member fixes synth-title drift: an LLM-merged
 * title is abstracted/shortened and often loses cosine to a long-form
 * paraphrase, but the original member's text is still close. Without the
 * transitive bump, the pipeline would keep spawning duplicate synths that
 * share members with existing ones.
 *
 *   Pass 1 — SYNTH ATTACH: any synth with best evidence ≥ attachThreshold
 *     → attach (0 LLM).
 *
 *   Pass 2 — TOPIC-CLUSTER ATTACH: any topic cluster with best evidence
 *     ≥ clusterThreshold → attach (0 LLM). Lenient: topic clusters group
 *     distinct-but-related ideas under a theme label.
 *
 *   Pass 3 — SPAWN (LLM-judged): top *plain option that is NOT already a
 *     member of a candidate cluster*, at cosine ≥ clusterThreshold → call
 *     generateSynthesizedProposal:
 *       · success (proposal generated) → SPAWN SYNTH (1 LLM total)
 *       · cannotSynthesize             → fall back to generateTopicLabel
 *                                        → SPAWN TOPIC CLUSTER (2 LLM total)
 *     The cluster-fallback path bypasses the spawn-debounce window because
 *     the synth attempt already consumed it. We skip options that already
 *     belong to a cluster — they should have been picked up by Pass 1/2
 *     via transitive evidence; if they weren't, spawning from them would
 *     just create a duplicate synth.
 *
 *   Pass 4 — REVIEW: top candidate at cosine ≥ reviewLowerBound but no
 *     plain option above clusterThreshold → queue pair for admin review
 *     (0 LLM).
 *
 *   Pass 5 — SINGLETON: no candidates above reviewLowerBound → leave
 *     option as-is. Single-option singletons are NOT written as clusters.
 *
 * Caller-controlled `forceProcess` skips the engagement-threshold check.
 * Admin-initiated selective synthesis is the only legitimate user of that
 * flag; automatic triggers never pass it.
 */

const NEIGHBOR_LIMIT = 10;

/**
 * Snowball brake for synth attaches: a newcomer that clears `attachThreshold`
 * to one member must ALSO be cohesive with the cluster as a whole — either
 * close to the member centroid, or broadly related to a quorum of members.
 * Topic-cluster attaches (Pass 2) are intentionally lenient and not gated.
 *
 * `SYNTH_COHESION_QUORUM` is the fraction of members the option must be
 * "broadly related" to (cosine ≥ clusterThreshold) when the centroid signal
 * alone doesn't carry it.
 */
const SYNTH_COHESION_QUORUM = 0.5;

export interface PipelineInput {
	optionId: string;
	source: 'onCreate' | 'onThresholdCross' | 'queueWorker' | 'synthesizeNow' | 'selective';
	option?: Statement;
	parent?: Statement;
	forceProcess?: boolean;
	/**
	 * Caller-supplied embedding for the option. When present, the pipeline
	 * uses it directly instead of polling the cache + falling back to inline
	 * generation in `ensureEmbedding`. Live-synth triggers pre-compute the
	 * embedding with the correct parent-text context so the pipeline never
	 * pays the 5s cache-wait + redundant OpenAI call observed when this
	 * field is omitted.
	 */
	precomputedEmbedding?: number[];
}

export type PipelineAction =
	| 'attached'
	| 'spawned'
	| 'seeded-singleton'
	| 'review-queued'
	| 'skipped';

export interface PipelineResult {
	action: PipelineAction;
	reason: string;
	clusterId?: string;
	llmCalled: boolean;
	durationMs: number;
}

function db() {
	return getFirestore();
}

function isOption(statement: Statement | undefined): statement is Statement {
	return Boolean(statement && statement.statementType === StatementType.option);
}

async function loadStatement(statementId: string): Promise<Statement | null> {
	try {
		const snap = await db().collection(Collections.statements).doc(statementId).get();
		if (!snap.exists) return null;

		return snap.data() as Statement;
	} catch (error) {
		logger.warn('synthesis.pipeline.loadStatement: failed', {
			statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

function skipped(reason: string, startedAt: number): PipelineResult {
	return { action: 'skipped', reason, llmCalled: false, durationMs: Date.now() - startedAt };
}

export async function runSinglePipeline(input: PipelineInput): Promise<PipelineResult> {
	const startedAt = Date.now();

	const option = input.option ?? (await loadStatement(input.optionId));
	if (!option) return skipped('option-not-found', startedAt);
	if (!isOption(option)) return skipped('not-an-option', startedAt);
	if (!option.parentId || option.parentId === 'top') return skipped('no-parent', startedAt);
	// `integratedOptions` is populated on CLUSTER statements; this guards against
	// running the pipeline on a cluster (or a legacy option that carries the
	// array directly).
	if ((option.integratedOptions ?? []).length > 0) return skipped('already-clustered', startedAt);

	// Authoritative membership pre-check (fixes the cross-cluster double-claim).
	// A member option does NOT carry `integratedOptions` — membership lives on
	// the CLUSTER's `integratedOptions` array — so the guard above never catches
	// an option that is already attached to a cluster. Without this query,
	// re-processing an already-clustered option (re-evaluation triggers, a
	// "Synthesize" re-run, or a queue replay) re-enters the attach passes and
	// adds the option to a SECOND cluster, because `attachOptionToCluster` only
	// checks membership in its own target. Query the clusters that actually list
	// this option and skip if any live (non-hidden) cluster already owns it, so
	// the pipeline is idempotent with respect to cluster membership.
	const owningClusters = await findClustersContainingMember(option.statementId);
	const liveOwner = owningClusters.find((c) => c.hide !== true);
	if (liveOwner) {
		return skipped(`already-member-of-cluster:${liveOwner.statementId}`, startedAt);
	}

	const parent = input.parent ?? (await loadStatement(option.parentId));
	if (!parent) return skipped('parent-not-found', startedAt);

	const settings = loadSynthesisSettingsFromStatement(parent);

	// `enabled` means "continuous (background) synthesis is on". It gates
	// only the two automatic-trigger sources. On-demand work (admin clicked
	// Synthesize / Selective / Re-judge) flows through the queue worker
	// and must run regardless of the continuous switch — admins explicitly
	// asked for it.
	const isContinuousSource = input.source === 'onCreate' || input.source === 'onThresholdCross';
	if (isContinuousSource && !settings.enabled) {
		return skipped('continuous-synthesis-disabled', startedAt);
	}

	if (!input.forceProcess) {
		const evals = option.evaluation?.numberOfEvaluators ?? 0;
		// Eligibility is evaluator-count only — consensus does NOT gate clustering.
		// Grouping is about semantic similarity, not agreement; a controversial
		// (low / negative consensus) option still belongs with its near-duplicates,
		// it just ranks lower inside the group. (minConsensus retained as inert.)
		if (evals < settings.minEvaluators) return skipped('below-min-evaluators', startedAt);
	}

	const embedding =
		input.precomputedEmbedding && input.precomputedEmbedding.length > 0
			? input.precomputedEmbedding
			: await ensureEmbedding(option, parent.statement);
	if (!embedding) return skipped('no-embedding', startedAt);

	const neighbors = await vectorSearchService.findSimilarByEmbedding(embedding, option.parentId, {
		limit: NEIGHBOR_LIMIT,
		threshold: settings.reviewLowerBound,
	});

	const candidates = neighbors.filter((n) => n.statement.statementId !== option.statementId);
	if (candidates.length === 0) {
		return {
			action: 'seeded-singleton',
			reason: 'no-neighbors-above-review-lower-bound',
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	const top = candidates[0];
	const triggerSource = `pipeline:${input.source}`;
	const bypassDebounce = input.source === 'synthesizeNow' || input.source === 'selective';

	// =====================================================================
	// Best-evidence index per candidate cluster
	// =====================================================================
	// A cluster's "best evidence" against the new option is the MAX of:
	//   (a) its own direct cosine (cluster title vs new option), and
	//   (b) the highest cosine of any of its members that also appears in
	//       the candidates list (member-via transitive evidence).
	//
	// This is what fixes the duplicate-synth fragmentation we see in
	// production: synth titles abstract and shorten the merged proposal,
	// so their direct cosine to a new paraphrase often drops well below
	// the cosine of the original member texts. Without this index, a
	// new paraphrase at cosine 0.76 to an existing synth's member would
	// be picked as a spawn sibling — creating a 2nd synth that shares
	// the member with the 1st. With the index, the synth gets the
	// member's cosine as evidence, attach passes fire, no fragmentation.
	interface ClusterEvidence {
		cluster: Statement;
		bestSimilarity: number;
		viaMember: boolean;
	}
	const clusterEvidence = new Map<string, ClusterEvidence>();
	for (const c of candidates) {
		if (isCluster(c.statement)) {
			clusterEvidence.set(c.statement.statementId, {
				cluster: c.statement,
				bestSimilarity: c.similarity,
				viaMember: false,
			});
		}
	}
	// Set of every option that is already a member of some cluster in
	// candidates — used both for transitive evidence (here) and to
	// exclude these options from spawn candidacy (below).
	const memberOptionIds = new Set<string>();
	for (const c of candidates) {
		if (isCluster(c.statement)) {
			for (const m of c.statement.integratedOptions ?? []) {
				memberOptionIds.add(m);
			}
		}
	}
	for (const c of candidates) {
		if (isCluster(c.statement)) continue;
		if (!memberOptionIds.has(c.statement.statementId)) continue;
		// This plain option is in some cluster; promote its cosine into
		// the evidence score for every cluster (in candidates) that
		// contains it.
		for (const cand of candidates) {
			if (!isCluster(cand.statement)) continue;
			const members = cand.statement.integratedOptions ?? [];
			if (!members.includes(c.statement.statementId)) continue;
			const existing = clusterEvidence.get(cand.statement.statementId);
			if (!existing || c.similarity > existing.bestSimilarity) {
				clusterEvidence.set(cand.statement.statementId, {
					cluster: cand.statement,
					bestSimilarity: c.similarity,
					viaMember: true,
				});
			}
		}
	}

	// =====================================================================
	// Stage B — full-member evidence expansion
	// =====================================================================
	// Stage A only surfaces the top-N (N=10) vector neighbors. When a cluster
	// has many members and only a few land in the neighborhood (or none, if
	// they were crowded out by other near-duplicates), the in-candidates
	// transitive evidence above can fail to lift the cluster above the
	// attach gate. Stage B fetches every member's stored embedding and
	// promotes bestSimilarity using the average of top-2 member cosines.
	// See candidateExpansion.ts for the rationale on top-2-average.
	const stageBStarted = Date.now();
	const stageB = await expandClusterEvidenceViaFullMembers(clusterEvidence, embedding);
	const memberEmbeddings = stageB.memberEmbeddings ?? new Map<string, number[]>();
	if (stageB.promotions > 0) {
		logger.debug('synthesis.pipeline.stageB.promotions', {
			optionId: option.statementId,
			clusterCount: clusterEvidence.size,
			promoted: stageB.promotions,
			durationMs: Date.now() - stageBStarted,
		});
	}

	// =====================================================================
	// PASS 1 — SYNTH ATTACH: any synth with best evidence ≥ attachThreshold
	// AND cohesion with the cluster as a whole (the snowball brake).
	// =====================================================================
	// `bestSimilarity` is "≥ threshold to the best single member" — the
	// candidacy signal. Before attaching we additionally require the newcomer
	// to fit the cluster's centroid or a quorum of members, so a single close
	// member can no longer drag in a far outlier (see clusterCohesion.ts).
	const cohesionGate: CohesionGate = {
		centroidFloor: settings.synthLowerBound,
		memberFloor: settings.clusterThreshold,
		quorumFraction: SYNTH_COHESION_QUORUM,
	};
	const synthMatches = Array.from(clusterEvidence.values())
		.filter((x) => isSynth(x.cluster) && x.bestSimilarity >= settings.attachThreshold)
		.sort((a, b) => b.bestSimilarity - a.bestSimilarity);
	for (const synthMatch of synthMatches) {
		const memberVecs = (synthMatch.cluster.integratedOptions ?? [])
			.map((id) => memberEmbeddings.get(id))
			.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
		const cohesion = assessCohesion(memberVecs, embedding, cohesionGate.memberFloor);
		if (!passesCohesionGate(cohesion, cohesionGate)) {
			logger.info('synthesis.pipeline.attach.cohesionRejected', {
				optionId: option.statementId,
				clusterId: synthMatch.cluster.statementId,
				bestSimilarity: Number(synthMatch.bestSimilarity.toFixed(3)),
				centroidCosine: Number(cohesion.centroidCosine.toFixed(3)),
				fractionAboveFloor: Number(cohesion.fractionAboveFloor.toFixed(2)),
				memberCount: cohesion.memberCount,
			});
			continue;
		}

		const result = await attachOptionToCluster({
			cluster: synthMatch.cluster,
			option,
			similarity: synthMatch.bestSimilarity,
			triggerSource,
		});
		if (!result.attached) {
			return skipped('attach-already-member-or-failed', startedAt);
		}

		return {
			action: 'attached',
			reason: `synth attach cosine=${synthMatch.bestSimilarity.toFixed(3)} ≥ ${settings.attachThreshold}${synthMatch.viaMember ? ' (via member)' : ''} cohesion(centroid=${cohesion.centroidCosine.toFixed(2)}, quorum=${cohesion.fractionAboveFloor.toFixed(2)})`,
			clusterId: synthMatch.cluster.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// =====================================================================
	// PASS 2 — TOPIC-CLUSTER ATTACH: any topic cluster with best evidence
	// ≥ clusterThreshold
	// =====================================================================
	const topicMatch = Array.from(clusterEvidence.values())
		.filter((x) => isTopicCluster(x.cluster) && x.bestSimilarity >= settings.clusterThreshold)
		.sort((a, b) => b.bestSimilarity - a.bestSimilarity)[0];
	if (topicMatch) {
		const result = await attachOptionToCluster({
			cluster: topicMatch.cluster,
			option,
			similarity: topicMatch.bestSimilarity,
			triggerSource,
		});
		if (!result.attached) {
			return skipped('attach-already-member-or-failed', startedAt);
		}

		return {
			action: 'attached',
			reason: `topic-cluster attach cosine=${topicMatch.bestSimilarity.toFixed(3)} ≥ ${settings.clusterThreshold}${topicMatch.viaMember ? ' (via member)' : ''}`,
			clusterId: topicMatch.cluster.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// Top plain option for spawn — must NOT already be a member of any
	// cluster in candidates, or we'd create a duplicate synth sharing
	// members with an existing one.
	const topPlainOption = candidates.find(
		(c) => !isCluster(c.statement) && !memberOptionIds.has(c.statement.statementId),
	);

	// =====================================================================
	// PASS 3 — SPAWN (band-routed): top plain option ≥ clusterThreshold
	// =====================================================================
	// Route by cosine band (see bandRouter.ts):
	//   - cosine ≥ synthLowerBound → try synth (LLM unified proposal);
	//     on cannotSynthesize fall back to topic-cluster.
	//   - clusterThreshold ≤ cosine < synthLowerBound → spawn topic-cluster
	//     directly (cheap generateTopicLabel; skip the wasted synth attempt
	//     since the prompt won't refuse on non-conflicting distinct ideas).
	if (topPlainOption && topPlainOption.similarity >= settings.clusterThreshold) {
		const route = routeByCosine(topPlainOption.similarity, settings);

		if (route === 'spawn-topic-cluster') {
			const clusterAttempt = await spawnClusterFromPair({
				option,
				sibling: topPlainOption.statement,
				similarity: topPlainOption.similarity,
				parentStatement: parent,
				triggerSource,
				bypassDebounce,
				mode: 'cluster',
			});
			if (clusterAttempt.spawned) {
				return {
					action: 'spawned',
					reason: `spawn topic-cluster at cosine=${topPlainOption.similarity.toFixed(3)} (sub-synth band)`,
					clusterId: clusterAttempt.clusterId,
					llmCalled: true,
					durationMs: Date.now() - startedAt,
				};
			}
			if (clusterAttempt.debounced) {
				return skipped('spawn-debounced', startedAt);
			}

			return skipped('spawn-failed', startedAt);
		}

		// route === 'spawn-synth' — try synth first, fall back to cluster.
		const synthAttempt = await spawnClusterFromPair({
			option,
			sibling: topPlainOption.statement,
			similarity: topPlainOption.similarity,
			parentStatement: parent,
			triggerSource,
			bypassDebounce,
			mode: 'synth',
		});
		if (synthAttempt.spawned) {
			return {
				action: 'spawned',
				reason: `spawn synth at cosine=${topPlainOption.similarity.toFixed(3)}`,
				clusterId: synthAttempt.clusterId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
		if (synthAttempt.cannotSynthesize) {
			const clusterFallback = await spawnClusterFromPair({
				option,
				sibling: topPlainOption.statement,
				similarity: topPlainOption.similarity,
				parentStatement: parent,
				triggerSource,
				bypassDebounce: true,
				mode: 'cluster',
			});
			if (clusterFallback.spawned) {
				return {
					action: 'spawned',
					reason: `spawn cluster (LLM refused synth) at cosine=${topPlainOption.similarity.toFixed(3)}`,
					clusterId: clusterFallback.clusterId,
					llmCalled: true,
					durationMs: Date.now() - startedAt,
				};
			}

			return skipped('cluster-fallback-failed', startedAt);
		}
		if (synthAttempt.debounced) {
			return skipped('spawn-debounced', startedAt);
		}

		return skipped('spawn-failed', startedAt);
	}

	// =====================================================================
	// PASS 4 — REVIEW: top candidate ≥ reviewLowerBound
	// (guaranteed by vector-search filter — anything in `candidates` is above)
	// =====================================================================
	await queueForReview({
		option,
		sibling: top.statement,
		similarity: top.similarity,
		reason: 'gray-band match (no auto-action)',
		triggerSource,
	});

	return {
		action: 'review-queued',
		reason: `gray-band cosine=${top.similarity.toFixed(3)}`,
		llmCalled: false,
		durationMs: Date.now() - startedAt,
	};
}

export const __INTERNAL = { NEIGHBOR_LIMIT };

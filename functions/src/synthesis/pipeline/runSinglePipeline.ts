import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { vectorSearchService } from '../../services/vector-search-service';
import { judgeSemanticEquivalence } from '../../services/semantic-equivalence-service';
import { findClustersContainingMember } from '../liveSynth/clusterRecompute';
import { noteStatementProcessed, runConsolidation } from '../consolidation/consolidateClaims';
import { loadSynthesisSettingsFromStatement } from './loadSynthesisSettings';
import type { SynthesisSettings } from './types';
import { ensureEmbedding } from './embedding';
import { expandClusterEvidenceViaFullMembers } from './candidateExpansion';
import {
	assessCohesion,
	passesCohesionGate,
	passesTopicCohesionGate,
	synthCentroidFloor,
	type CohesionGate,
} from './clusterCohesion';
import { routeByCosine } from './bandRouter';
import { runRegistryPass } from './registryPass';
import { assignOptionToTheme, nestSynthUnderTopic } from './nestSynthesis';
import { enqueueItem } from '../queue/enqueue';
import {
	attachOptionToCluster,
	isCluster,
	isSynth,
	isTopicCluster,
	queueForReview,
	rehomeMembersIntoSynth,
	spawnClusterFromPair,
	spawnSingletonClaimCluster,
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
 * The passes run most-specific-first. Saying two statements are the SAME IDEA
 * is a stronger claim than saying they share a theme, so every synthesis
 * opportunity is exhausted before any theming happens. Running theming first
 * looks harmless and is not: a theme holding your twin always looks cohesive to
 * you, because your twin is inside its centroid, so the general claim wins using
 * the specific claim's own evidence. Measured, that ordering merged 2 of 50
 * ground-truth pairs.
 *
 *   Pass 1 — SYNTH ATTACH: any synth with best evidence ≥ attachThreshold,
 *     gated on cohesion with the whole cluster → attach (0 LLM).
 *
 *   Pass 2 — SYNTH SPAWN (LLM-judged): top plain option in the near-duplicate
 *     band → generateSynthesizedProposal:
 *       · success           → SPAWN SYNTH (1 LLM), then nest it under its theme
 *       · cannotSynthesize  → fall through; "distinct ideas" is the case FOR
 *                             theming, so the passes below handle it
 *       · anything else     → re-queue, never drop (see deferFailedSpawn)
 *     A sibling inside a SYNTH is excluded — spawning from it would duplicate
 *     that synth. A sibling inside a TOPIC CLUSTER is not: it has been given a
 *     theme, not a meaning.
 *
 *   Pass 3 — TOPIC-CLUSTER ATTACH: any topic cluster with best evidence
 *     ≥ clusterThreshold AND centroid cohesion with the theme → attach (0 LLM).
 *     Then Pass 3b — if cosine could not place it, the THEME JUDGE decides
 *     (1 fast LLM). It may join an existing theme but never create one.
 *
 *   Pass 4 — REGISTRY: claim-codebook classification when cosine couldn't place
 *     the option (claim-registry questions only).
 *
 *   Pass 5 — TOPIC SPAWN: two distinct-but-related ideas, neither claimed by
 *     any cluster → generateTopicLabel → SPAWN TOPIC CLUSTER (1 LLM). OFF by
 *     default — themes are born from syntheses now (see nestSynthesis.ts),
 *     because cosine cannot tell whether two raw options share a theme and this
 *     path spawned near-duplicate themes it could not see were redundant.
 *
 *   Pass 6 — REVIEW: top candidate at cosine ≥ reviewLowerBound but nothing
 *     above clusterThreshold → queue pair for admin review (0 LLM).
 *
 *   Pass 7 — SINGLETON: no candidates above reviewLowerBound → leave
 *     option as-is. Single-option singletons are NOT written as clusters.
 *
 * Caller-controlled `forceProcess` skips the engagement-threshold check.
 * Admin-initiated selective synthesis is the only legitimate user of that
 * flag; automatic triggers never pass it.
 */

/**
 * How many neighbours the pipeline inspects. Raised 10 → 15 for the compressed
 * geometries: under Hebrew 3-large the whole space packs into ~0.64–0.94, and
 * a mature question's ~60 cluster docs (synth titles, theme titles) crowd the
 * window — measured on `he-seed42-large-judged`, a true twin at cosine 0.831
 * ranked #10 behind four theme titles and three unrelated statements, and
 * pairs like walk-in-help-desks (0.803) fell outside the window entirely.
 * Extra candidates only add evidence; every gate that acts on them is
 * unchanged.
 */
const NEIGHBOR_LIMIT = 15;

/**
 * How many in-band plain candidates Pass 2 will offer the synthesis judge
 * before giving up on spawning. One was enough in English 3-small space,
 * where the twin essentially always ranks first among plain options. In
 * compressed spaces the ranking is noisy: on `he-seed42-large-judged` the
 * top plain candidate for a traffic-calming statement was an unrelated
 * bus-frequency statement at 0.846 with the true twin one plain-rank below
 * at 0.831 — the judge refused the wrong pair and the right pair was never
 * put to it. A refusal is a verdict on ONE pair, not on the option's
 * spawnability, so the next in-band candidate gets a turn. Bounded: extra
 * LLM calls happen only after a refusal, which in well-separated spaces is
 * precisely the case where there is nothing to find.
 */
const SPAWN_CANDIDATE_ATTEMPTS = 3;

/**
 * Snowball brake for synth attaches: a newcomer that clears `attachThreshold`
 * to one member must ALSO be cohesive with the cluster as a whole — close to
 * the member centroid AND broadly related to a quorum of members.
 *
 * `SYNTH_COHESION_QUORUM` is the fraction of members the option must be
 * "broadly related" to. See `synthCentroidFloor` in clusterCohesion.ts for the
 * measured separation that sets both floors, and for why the two signals are
 * combined with AND — as an OR, with the per-member floor at `clusterThreshold`,
 * this gate never once refused an attach in a 100-statement run.
 */
const SYNTH_COHESION_QUORUM = 0.5;

/**
 * Same brake for topic-cluster attaches (Pass 3), which used to have none.
 *
 * "Lenient by design" turned out to mean "unbounded": with best evidence being
 * the MAX over members, and 80% of measured cross-topic pairs clearing a 0.60
 * gate, a single member matching at 0.60 pulled in any statement at all. The
 * 100-statement accuracy benchmark measured the end state directly — one topic
 * cluster holding all 100 statements, and zero syntheses, because a clustered
 * option was then excluded from spawning.
 *
 * `passesTopicCohesionGate` combines the two cohesion signals with AND and
 * anchors on the centroid; see clusterCohesion.ts for the measured separation
 * that sets the floor at `synthLowerBound`.
 */
const TOPIC_COHESION_QUORUM = 0.5;

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

/**
 * Defer a spawn that lost the per-parent debounce so the queue worker retries it
 * once the window has passed.
 *
 * Without this the spawn opportunity is lost permanently. `runSinglePipeline` runs
 * once per option create, and nothing else re-triggers a debounced option — so the
 * debounce's premise that "subsequent options fall through to the attach path on
 * the next tick" only holds when some later event happens to re-process the option.
 * Measured on the 100-statement accuracy benchmark: 45 spawn attempts, 24 spawned,
 * 21 debounced and silently dropped, which capped pair recall at 40% even though
 * every pair was well within the attach band.
 *
 * `enqueueItem` derives a deterministic per-option id, so re-enqueuing is
 * idempotent. Failure is non-fatal: the spawn is already lost at this point, and
 * throwing here would fail the whole trigger.
 */
async function deferSpawnAfterDebounce(
	optionId: string,
	questionId: string,
	startedAt: number,
): Promise<PipelineResult> {
	try {
		await enqueueItem({ questionId, kind: 'process-option', optionId, forceProcess: false });
	} catch (error) {
		logger.warn('synthesis.pipeline.spawn: debounced retry could not be queued', {
			optionId,
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return skipped('spawn-debounced', startedAt);
}

/**
 * Re-queue a spawn that failed for a reason that may not recur — an LLM error, a
 * malformed proposal, a transient write failure.
 *
 * Same shape of bug as the dropped debounce, one branch over: `spawnClusterFromPair`
 * returning `spawned: false` used to end the pipeline with `skipped('spawn-failed')`,
 * writing no audit row and scheduling no retry, so the opportunity was gone. Measured
 * on the accuracy benchmark: one ground-truth pair at cosine 0.898 — the twin sitting
 * at rank 1, well inside the attach band — lost with no trace of why.
 *
 * Idempotent via `enqueueItem`'s deterministic per-option id. A retry that fails the
 * same way simply re-queues; the queue worker's own bounds stop it running forever.
 */
async function deferFailedSpawn(
	optionId: string,
	questionId: string,
	startedAt: number,
): Promise<PipelineResult> {
	logger.warn('synthesis.pipeline.spawn: failed, re-queued for retry', { optionId, questionId });
	try {
		await enqueueItem({ questionId, kind: 'process-option', optionId, forceProcess: false });
	} catch (error) {
		logger.warn('synthesis.pipeline.spawn: failed spawn could not be re-queued', {
			optionId,
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return skipped('spawn-failed-requeued', startedAt);
}

interface PipelineContext {
	parent?: Statement;
	settings?: SynthesisSettings;
}

export async function runSinglePipeline(input: PipelineInput): Promise<PipelineResult> {
	const ctx: PipelineContext = {};
	const result = await executePipeline(input, ctx);

	// Claim-registry cadence: count placed statements; every Nth placement
	// triggers a claim-level consolidation pass (merge equivalent claims,
	// flag too-broad ones, confirm mature provisional claims). Runs after
	// placement so the new statement's cluster participates in the pass.
	if (
		ctx.settings?.claimRegistryEnabled &&
		ctx.parent &&
		(result.action === 'attached' || result.action === 'spawned')
	) {
		const due = await noteStatementProcessed(ctx.parent.statementId);
		if (due) {
			await runConsolidation(ctx.parent.statementId, ctx.parent.statement ?? '');
		}
	}

	return result;
}

async function executePipeline(
	input: PipelineInput,
	ctx: PipelineContext,
): Promise<PipelineResult> {
	const startedAt = Date.now();

	const option = input.option ?? (await loadStatement(input.optionId));
	if (!option) return skipped('option-not-found', startedAt);
	if (!isOption(option)) return skipped('not-an-option', startedAt);
	// A cluster container is a StatementType.option with isCluster:true and would
	// pass isOption() — never process one as a member (it would be embedded and
	// attached/merged into another cluster, deleting a just-created manual cluster).
	// Central guard covering every pipeline source (onCreate, threshold, queue, admin).
	if (option.isCluster === true) return skipped('is-cluster', startedAt);
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
	const liveOwners = owningClusters.filter((c) => c.hide !== true);
	// A SYNTH owner is terminal: the option's meaning is already merged, and
	// re-entering the attach passes would add it to a SECOND cluster.
	const synthOwner = liveOwners.find((c) => isSynth(c));
	if (synthOwner) {
		return skipped(`already-member-of-cluster:${synthOwner.statementId}`, startedAt);
	}
	// A TOPIC-cluster owner is NOT terminal. Topic clusters bundle
	// distinct-but-related ideas under a theme; a statement sitting in one has
	// not yet been merged with anything, so its twin must still be able to form
	// a synthesis with it. Treating topic membership as terminal is what made the
	// first cluster to touch a statement its permanent owner — measured as the
	// dominant cause of missed pairs on the accuracy benchmark. Continue, but
	// only down the synthesis paths: this option already has a theme, so Pass 2
	// (topic attach), Pass 4 (review) and Pass 5 (singleton) have nothing to add.
	const topicOwners = liveOwners.filter((c) => isTopicCluster(c));
	const alreadyInTopic = topicOwners.length > 0;

	const parent = input.parent ?? (await loadStatement(option.parentId));
	if (!parent) return skipped('parent-not-found', startedAt);

	const settings = loadSynthesisSettingsFromStatement(parent);
	ctx.parent = parent;
	ctx.settings = settings;

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
	const triggerSource = `pipeline:${input.source}`;
	if (candidates.length === 0 && alreadyInTopic) {
		return skipped('already-in-topic-cluster:no-synth-candidates', startedAt);
	}
	if (candidates.length === 0) {
		// ★ REGISTRY PASS (zero-candidate path). Vector search found NOTHING —
		// exactly the "same meaning, distant embeddings" recall gap. Classify
		// against the full claim codebook before declaring a singleton; a true
		// singleton spawns a single-member provisional claim so the idea is
		// labeled from statement #1. See docs/architecture/CLAIM_REGISTRY.md.
		if (settings.claimRegistryEnabled) {
			const registryResult = await runRegistryPass({
				option,
				parent,
				settings,
				cosineByCluster: new Map(),
				triggerSource,
			});
			if (registryResult?.attached) {
				return {
					action: 'attached',
					reason: registryResult.reason,
					clusterId: registryResult.clusterId,
					llmCalled: true,
					durationMs: Date.now() - startedAt,
				};
			}
			const singleton = await spawnSingletonClaimCluster({
				option,
				parentStatement: parent,
				triggerSource,
			});
			if (singleton.spawned) {
				return {
					action: 'spawned',
					reason: 'singleton provisional claim (no neighbors, no registry match)',
					clusterId: singleton.clusterId,
					llmCalled: true,
					durationMs: Date.now() - startedAt,
				};
			}
		}

		return {
			action: 'seeded-singleton',
			reason: 'no-neighbors-above-review-lower-bound',
			llmCalled: settings.claimRegistryEnabled,
			durationMs: Date.now() - startedAt,
		};
	}

	const top = candidates[0];
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
	const memberEvidence = stageB.memberEvidence ?? new Map<string, number>();
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
	// Both floors were originally set a whole band too low — the centroid at
	// `synthLowerBound` and the per-member floor at `clusterThreshold` — and
	// combined with OR, which made the gate inert on a single-question corpus.
	// See `synthCentroidFloor` for the measured separation that sets them.
	const cohesionGate: CohesionGate = {
		centroidFloor: synthCentroidFloor(settings.synthLowerBound, settings.attachThreshold),
		memberFloor: settings.synthLowerBound,
		quorumFraction: SYNTH_COHESION_QUORUM,
	};
	const synthMatches = Array.from(clusterEvidence.values())
		.filter((x) => isSynth(x.cluster) && x.bestSimilarity >= settings.attachThreshold)
		.sort((a, b) => b.bestSimilarity - a.bestSimilarity);
	for (const synthMatch of synthMatches) {
		// The cluster's own TITLE cosine may not carry an attach on its own.
		// `bestSimilarity` maxes title and member evidence so a drifting synth
		// title cannot hide a cluster from attach — but that same max lets an
		// abstracted title admit statements its members would have refused.
		// Measured, both observed false merges have this signature: the
		// cross-idea member cosines were ≤0.836, safely below attachThreshold,
		// and the title carried them over. Fail-open when no member embeddings
		// were available, matching the cohesion gate below.
		const memberSimilarity = memberEvidence.get(synthMatch.cluster.statementId);
		if (memberSimilarity !== undefined && memberSimilarity < settings.attachThreshold) {
			logger.info('synthesis.pipeline.attach.titleOnlyRejected', {
				optionId: option.statementId,
				clusterId: synthMatch.cluster.statementId,
				bestSimilarity: Number(synthMatch.bestSimilarity.toFixed(3)),
				memberSimilarity: Number(memberSimilarity.toFixed(3)),
				attachThreshold: settings.attachThreshold,
			});
			continue;
		}
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

		// Cosine proposes; the judge disposes — HERE TOO. This was the last
		// placement that acted on geometry alone, and on Hebrew 3-large it is
		// where 4 of 6 false merges entered: night-bus statements attached to a
		// peak-frequency synth at cosine 0.899–0.944, ABOVE every gate, because
		// in that space distinct transport ideas are geometrically
		// indistinguishable from paraphrases (twins span 0.73–0.97; no
		// threshold separates). The semantic judge is the reJudge gate's
		// primitive — verdict-cached, so a re-run is free — and only 'same'
		// attaches. Fail-CLOSED on any other verdict or error: an unmerged
		// duplicate self-heals (the option spawns its own synth and the reJudge
		// sweep merges true duplicates, measured clean), while a wrong attach
		// puts a member in the wrong merged proposal for every reader.
		const attachVerdict = await judgeSemanticEquivalence([
			{
				pairId: `${option.statementId}|${synthMatch.cluster.statementId}`,
				textA: option.statement ?? '',
				textB: synthMatch.cluster.statement ?? '',
			},
		]).catch(() => []);
		if (attachVerdict[0]?.verdict !== 'same') {
			logger.info('synthesis.pipeline.attach.judgeRefused', {
				optionId: option.statementId,
				clusterId: synthMatch.cluster.statementId,
				bestSimilarity: Number(synthMatch.bestSimilarity.toFixed(3)),
				verdict: attachVerdict[0]?.verdict ?? 'judge-error',
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

		// The option now lives in the synth. Any theme that held it directly holds
		// the synth instead, so it is never claimed twice and the theme still
		// reaches it one level down.
		for (const topicOwner of topicOwners) {
			await rehomeMembersIntoSynth(
				topicOwner,
				[option.statementId],
				synthMatch.cluster.statementId,
				triggerSource,
			);
		}
		// A growing synth that never found a theme gets another chance on every
		// attach — by now more themes exist for the judge to choose from.
		if (topicOwners.length === 0 && settings.llmThemeAssignment) {
			await nestSynthUnderTopic({
				synthId: synthMatch.cluster.statementId,
				memberIds: [...(synthMatch.cluster.integratedOptions ?? []), option.statementId],
				synthTitle: synthMatch.cluster.statement ?? '',
				synthDescription: synthMatch.cluster.description,
				parent,
				settings,
				triggerSource,
			});
		}

		return {
			action: 'attached',
			reason: `synth attach cosine=${synthMatch.bestSimilarity.toFixed(3)} ≥ ${settings.attachThreshold}${synthMatch.viaMember ? ' (via member)' : ''} cohesion(centroid=${cohesion.centroidCosine.toFixed(2)}, quorum=${cohesion.fractionAboveFloor.toFixed(2)})`,
			clusterId: synthMatch.cluster.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// Spawn candidacy — computed here because PASS 2 needs it.
	//
	// A sibling already inside a SYNTH is excluded: spawning from it would
	// create a second synth sharing its member. A sibling inside a TOPIC
	// CLUSTER is NOT excluded — it has been given a theme, not a meaning, and
	// its twin must still be able to merge with it. When that spawn succeeds,
	// `spawnClusterFromPair` re-homes the members into the new synth and puts
	// the synth in their place inside the theme.
	//
	// Excluding topic members here was, on the accuracy benchmark, the single
	// largest source of missed pairs: one early topic cluster starved the
	// synthesis layer for the rest of the run.
	const synthMemberIds = new Set<string>();
	for (const c of candidates) {
		if (!isCluster(c.statement) || !isSynth(c.statement)) continue;
		for (const m of c.statement.integratedOptions ?? []) synthMemberIds.add(m);
	}
	const topPlainOption = candidates.find(
		(c) => !isCluster(c.statement) && !synthMemberIds.has(c.statement.statementId),
	);
	// Spawning a THEME still needs a sibling free of every cluster — two themes
	// must not claim the same statement.
	const topFreeOption = candidates.find(
		(c) => !isCluster(c.statement) && !memberOptionIds.has(c.statement.statementId),
	);

	// =====================================================================
	// PASS 2 — SYNTH SPAWN (near-duplicate band, LLM-judged)
	// =====================================================================
	// This runs BEFORE the topic attach, and the order is load-bearing.
	//
	// Merging two statements of the same idea is a more specific claim than
	// filing one of them under a theme, so the specific claim gets first refusal.
	// The old order let the general claim win, and it won using the specific
	// claim's own evidence: a theme that already holds your twin will always look
	// cohesive to you, because your twin is in its centroid. Measured with topic
	// attach first — in 17 of 23 topic attaches, the member whose cosine
	// justified the attach WAS the statement's own twin. The pipeline used the
	// twin to file the statement away from it. End state: 2 of 50 pairs merged,
	// and the synthesis LLM consulted 4 times in a 100-statement run.
	//
	// A refusal (`cannotSynthesize`) is not terminal here — for the PAIR or for
	// the option. The LLM saying "these are distinct ideas" is a verdict on one
	// pairing, so the next in-band plain candidate gets a turn (see
	// SPAWN_CANDIDATE_ATTEMPTS for the measured case where the true twin sat
	// one rank below a wrong neighbour). Only when every offered pairing is
	// refused does the option fall through to the theming passes below.
	const spawnCandidates = candidates
		.filter(
			(c) =>
				!isCluster(c.statement) &&
				!synthMemberIds.has(c.statement.statementId) &&
				routeByCosine(c.similarity, settings) === 'spawn-synth',
		)
		.slice(0, SPAWN_CANDIDATE_ATTEMPTS);
	for (const spawnCandidate of spawnCandidates) {
		const synthAttempt = await spawnClusterFromPair({
			option,
			sibling: spawnCandidate.statement,
			similarity: spawnCandidate.similarity,
			parentStatement: parent,
			triggerSource,
			bypassDebounce,
			mode: 'synth',
			stampClaim: settings.claimRegistryEnabled,
		});
		if (synthAttempt.spawned) {
			// Put the new synthesis inside the theme it belongs to. Without this the
			// two layers never meet: a theme holds five distinct ideas, but the
			// moment two of them merge the merge leaves the theme behind.
			let nestNote = '';
			if (synthAttempt.clusterId && settings.llmThemeAssignment) {
				const nested = await nestSynthUnderTopic({
					synthId: synthAttempt.clusterId,
					memberIds: [option.statementId, spawnCandidate.statement.statementId],
					synthTitle: synthAttempt.title ?? option.statement,
					synthDescription: synthAttempt.description,
					parent,
					settings,
					triggerSource,
				});
				nestNote = nested.nested
					? ` (nested under ${nested.topicClusterId})`
					: ` (unthemed: ${nested.reason})`;
			}

			return {
				action: 'spawned',
				reason: `spawn synth at cosine=${spawnCandidate.similarity.toFixed(3)}${nestNote}`,
				clusterId: synthAttempt.clusterId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
		if (synthAttempt.debounced) {
			return deferSpawnAfterDebounce(option.statementId, parent.statementId, startedAt);
		}
		if (!synthAttempt.cannotSynthesize) {
			// Neither spawned, nor refused, nor debounced: an LLM error, a malformed
			// response, or the dedup guard. Work must never be dropped silently here
			// — measured cost of doing so, one ground-truth pair at cosine 0.898 lost
			// with no audit row and no retry. Re-queue and let the worker try again.
			return deferFailedSpawn(option.statementId, parent.statementId, startedAt);
		}
		// cannotSynthesize → this pairing is refused; offer the next candidate.
	}

	// =====================================================================
	// PASS 3 — TOPIC-CLUSTER ATTACH: any topic cluster with best evidence
	// ≥ clusterThreshold AND cohesion with the theme as a whole.
	// =====================================================================
	// `bestSimilarity` (the MAX over members) is the candidacy signal only. On a
	// single-question corpus the max cannot tell "same theme" from "same
	// question" — measured, 80% of cross-topic pairs clear a 0.60 gate — so the
	// attach itself is decided on the member CENTROID, which does separate them.
	// Skipped entirely when the option already belongs to a theme.
	//
	// RUNS ONLY WHEN THE FILING JUDGE IS OFF. This was the one placement path
	// that attached without judgement, and it is measured to be the residual
	// failure on BOTH languages: in the certified English run it carried 2 of
	// the 7 misfiles (Finding 16), and on Hebrew under 3-large it built a
	// 45-member cross-topic mega-theme single-handedly — 25 of its 45 members
	// entered here, because cross-topic Hebrew cosines run straight through
	// this band (4421 of 4500 cross-topic pairs clear 0.60; `heBands.mjs`,
	// Finding 17). With `llmThemeAssignment` on, cosine's role in theming is
	// candidacy only: an unplaced option falls through to Pass 3b, where the
	// judge sees every theme WITH its contents and decides — the same
	// cosine-proposes-judgement-disposes shape as every other placement.
	const topicGate: CohesionGate = {
		centroidFloor: settings.synthLowerBound,
		memberFloor: settings.clusterThreshold,
		quorumFraction: TOPIC_COHESION_QUORUM,
	};
	const topicMatches =
		alreadyInTopic || settings.llmThemeAssignment
			? []
			: Array.from(clusterEvidence.values())
					.filter((x) => isTopicCluster(x.cluster) && x.bestSimilarity >= settings.clusterThreshold)
					.sort((a, b) => b.bestSimilarity - a.bestSimilarity);
	for (const topicMatch of topicMatches) {
		const memberVecs = (topicMatch.cluster.integratedOptions ?? [])
			.map((id) => memberEmbeddings.get(id))
			.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
		const cohesion = assessCohesion(memberVecs, embedding, topicGate.memberFloor);
		if (!passesTopicCohesionGate(cohesion, topicGate)) {
			logger.info('synthesis.pipeline.topicAttach.cohesionRejected', {
				optionId: option.statementId,
				clusterId: topicMatch.cluster.statementId,
				bestSimilarity: Number(topicMatch.bestSimilarity.toFixed(3)),
				centroidCosine: Number(cohesion.centroidCosine.toFixed(3)),
				fractionAboveFloor: Number(cohesion.fractionAboveFloor.toFixed(2)),
				memberCount: cohesion.memberCount,
			});
			continue;
		}

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
			reason: `topic-cluster attach cosine=${topicMatch.bestSimilarity.toFixed(3)} ≥ ${settings.clusterThreshold}${topicMatch.viaMember ? ' (via member)' : ''} cohesion(centroid=${cohesion.centroidCosine.toFixed(2)}, quorum=${cohesion.fractionAboveFloor.toFixed(2)})`,
			clusterId: topicMatch.cluster.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// =====================================================================
	// PASS 3b — THEME JUDGE for a plain option that cosine could not place
	// =====================================================================
	// Same reasoning as the synthesis-level judge: theme membership is a
	// semantic call that cosine does not encode on a single-question corpus,
	// and Pass 3 above refused 107 attaches in one run precisely because it is
	// asking geometry a question geometry cannot answer. The judge may only file
	// the option into an EXISTING theme — creating one is reserved for
	// syntheses, since a single option is one person's wording and makes a poor
	// seed for a theme label.
	if (settings.llmThemeAssignment && !alreadyInTopic) {
		const themed = await assignOptionToTheme({ option, parent, triggerSource });
		if (themed.themeId) {
			return {
				action: 'attached',
				reason: `option filed under theme by judge (${themed.reason})`,
				clusterId: themed.themeId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
	}

	// =====================================================================
	// PASS 4 — ★ REGISTRY: cosine couldn't place the option (Passes 1–3 missed);
	// classify against the full claim codebook before spawning. A match here
	// at low/absent cosine is the Procaccia case, caught and logged.
	// =====================================================================
	if (settings.claimRegistryEnabled) {
		const cosineByCluster = new Map<string, number>();
		for (const [clusterId, evidence] of clusterEvidence) {
			cosineByCluster.set(clusterId, evidence.bestSimilarity);
		}
		const registryResult = await runRegistryPass({
			option,
			parent,
			settings,
			cosineByCluster,
			triggerSource,
		});
		if (registryResult?.attached) {
			return {
				action: 'attached',
				reason: registryResult.reason,
				clusterId: registryResult.clusterId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
	}

	// =====================================================================
	// PASS 5 — TOPIC SPAWN: sub-synth band, two distinct-but-related ideas
	// =====================================================================
	// Reached only when no synthesis was possible (PASS 2 found no
	// near-duplicate, or the LLM refused the pair as distinct ideas) and no
	// existing theme fit. Spawning a theme needs a sibling no other cluster
	// owns, and an option that already has a theme must not gain a second.
	if (
		settings.spawnThemesFromOptionPairs &&
		!alreadyInTopic &&
		topFreeOption &&
		routeByCosine(topFreeOption.similarity, settings) !== 'review' &&
		topFreeOption.similarity >= settings.clusterThreshold
	) {
		const clusterAttempt = await spawnClusterFromPair({
			option,
			sibling: topFreeOption.statement,
			similarity: topFreeOption.similarity,
			parentStatement: parent,
			triggerSource,
			// The synth attempt in PASS 2 already consumed the window for this pair.
			bypassDebounce: bypassDebounce || Boolean(topPlainOption),
			mode: 'cluster',
			stampClaim: settings.claimRegistryEnabled,
		});
		if (clusterAttempt.spawned) {
			return {
				action: 'spawned',
				reason: `spawn topic-cluster at cosine=${topFreeOption.similarity.toFixed(3)}`,
				clusterId: clusterAttempt.clusterId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
		if (clusterAttempt.debounced) {
			return deferSpawnAfterDebounce(option.statementId, parent.statementId, startedAt);
		}

		return deferFailedSpawn(option.statementId, parent.statementId, startedAt);
	}

	// =====================================================================
	// PASS 6 — REVIEW: top candidate ≥ reviewLowerBound
	// (guaranteed by vector-search filter — anything in `candidates` is above)
	// =====================================================================
	// An option that already sits in a theme is placed; there is nothing for an
	// admin to review and nothing to seed.
	if (alreadyInTopic) {
		return skipped('already-in-topic-cluster:no-synth-match', startedAt);
	}
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

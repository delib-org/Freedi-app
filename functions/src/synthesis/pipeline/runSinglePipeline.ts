import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { vectorSearchService } from '../../services/vector-search-service';
import { loadSynthesisSettingsFromStatement } from './loadSynthesisSettings';
import { ensureEmbedding } from './embedding';
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
 *   Pass 1 — SYNTH ATTACH: any existing synth at cosine ≥ attachThreshold
 *     → attach (0 LLM). Strict cosine is still appropriate here because the
 *     synth's regenerated title concentrates the merged proposal — true
 *     paraphrases of the synth land at or above 0.85.
 *
 *   Pass 2 — TOPIC-CLUSTER ATTACH: any existing topic cluster at cosine
 *     ≥ clusterThreshold → attach (0 LLM). Lenient: topic clusters group
 *     distinct-but-related ideas under a theme label.
 *
 *   Pass 3 — SPAWN (LLM-judged): top *plain option* at cosine ≥
 *     clusterThreshold → call generateSynthesizedProposal:
 *       · success (proposal generated) → SPAWN SYNTH (1 LLM total)
 *       · cannotSynthesize             → fall back to generateTopicLabel
 *                                        → SPAWN TOPIC CLUSTER (2 LLM total)
 *     The cluster-fallback path bypasses the spawn-debounce window because
 *     the synth attempt already consumed it. We look at the top plain
 *     option (not candidates[0]) so a synth ranking #1 below its attach
 *     threshold doesn't shadow a stronger plain-option duplicate behind it.
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

export interface PipelineInput {
	optionId: string;
	source: 'onCreate' | 'onThresholdCross' | 'queueWorker' | 'synthesizeNow' | 'selective';
	option?: Statement;
	parent?: Statement;
	forceProcess?: boolean;
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
	if ((option.integratedOptions ?? []).length > 0) return skipped('already-clustered', startedAt);

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
		const cons = option.consensus ?? 0;
		if (evals < settings.minEvaluators) return skipped('below-min-evaluators', startedAt);
		if (cons < settings.minConsensus) return skipped('below-min-consensus', startedAt);
	}

	const embedding = await ensureEmbedding(option);
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
	const topPlainOption = candidates.find((c) => !isCluster(c.statement));
	const triggerSource = `pipeline:${input.source}`;
	const bypassDebounce = input.source === 'synthesizeNow' || input.source === 'selective';

	// =====================================================================
	// PASS 1 — SYNTH ATTACH (strict): any existing synth at ≥ attachThreshold
	// =====================================================================
	const synthMatch = candidates.find(
		(c) => c.similarity >= settings.attachThreshold && isSynth(c.statement),
	);
	if (synthMatch) {
		const result = await attachOptionToCluster({
			cluster: synthMatch.statement,
			option,
			similarity: synthMatch.similarity,
			triggerSource,
		});
		if (!result.attached) {
			return skipped('attach-already-member-or-failed', startedAt);
		}

		return {
			action: 'attached',
			reason: `synth attach cosine=${synthMatch.similarity.toFixed(3)} ≥ ${settings.attachThreshold}`,
			clusterId: synthMatch.statement.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// =====================================================================
	// PASS 2 — TOPIC-CLUSTER ATTACH: any existing topic cluster at
	// ≥ clusterThreshold
	// =====================================================================
	const topicMatch = candidates.find(
		(c) => c.similarity >= settings.clusterThreshold && isTopicCluster(c.statement),
	);
	if (topicMatch) {
		const result = await attachOptionToCluster({
			cluster: topicMatch.statement,
			option,
			similarity: topicMatch.similarity,
			triggerSource,
		});
		if (!result.attached) {
			return skipped('attach-already-member-or-failed', startedAt);
		}

		return {
			action: 'attached',
			reason: `topic-cluster attach cosine=${topicMatch.similarity.toFixed(3)} ≥ ${settings.clusterThreshold}`,
			clusterId: topicMatch.statement.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// =====================================================================
	// PASS 3 — SPAWN (LLM-judged): top plain option at ≥ clusterThreshold
	// =====================================================================
	// Try synth first (generateSynthesizedProposal). If the LLM says
	// cannotSynthesize, fall back to topic cluster (generateTopicLabel) —
	// with bypassDebounce because the synth attempt already consumed the
	// per-parent spawn-debounce window.
	if (topPlainOption && topPlainOption.similarity >= settings.clusterThreshold) {
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

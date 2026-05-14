import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import { vectorSearchService } from '../../services/vector-search-service';
import { loadSynthesisSettingsFromStatement } from './loadSynthesisSettings';
import { ensureEmbedding } from './embedding';
import {
	attachOptionToCluster,
	isCluster,
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
 * Decision tree (after embedding + vector search):
 *   - top cosine ≥ attachThreshold AND target is a cluster → ATTACH (0 LLM)
 *   - top cosine ≥ attachThreshold AND target is a plain option → SPAWN (1 LLM)
 *   - top cosine in [reviewLowerBound, attachThreshold) → REVIEW (0 LLM)
 *   - no neighbors above reviewLowerBound → SEED-SINGLETON (0 LLM, no cluster)
 *
 * Single-option singletons are NOT written as clusters — we leave the option
 * as-is until it has a peer to merge with. A "cluster" of one is the empty
 * default state.
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
	if (!settings.enabled) return skipped('synthesis-disabled', startedAt);

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
	const triggerSource = `pipeline:${input.source}`;

	// Branch 1 — auto-attach to existing cluster.
	if (top.similarity >= settings.attachThreshold && isCluster(top.statement)) {
		const result = await attachOptionToCluster({
			cluster: top.statement,
			option,
			similarity: top.similarity,
			triggerSource,
		});
		if (!result.attached) {
			return skipped('attach-already-member-or-failed', startedAt);
		}

		return {
			action: 'attached',
			reason: `cosine=${top.similarity.toFixed(3)} ≥ ${settings.attachThreshold}`,
			clusterId: top.statement.statementId,
			llmCalled: false,
			durationMs: Date.now() - startedAt,
		};
	}

	// Branch 2 — spawn cluster from top pair.
	if (top.similarity >= settings.attachThreshold) {
		const spawn = await spawnClusterFromPair({
			option,
			sibling: top.statement,
			similarity: top.similarity,
			parentStatement: parent,
			triggerSource,
			bypassDebounce: input.source === 'synthesizeNow' || input.source === 'selective',
		});
		if (spawn.spawned) {
			return {
				action: 'spawned',
				reason: `spawn at cosine=${top.similarity.toFixed(3)}`,
				clusterId: spawn.clusterId,
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
		if (spawn.cannotSynthesize) {
			// LLM refused → fall through to review queue
			await queueForReview({
				option,
				sibling: top.statement,
				similarity: top.similarity,
				reason: 'LLM refused synthesis',
				triggerSource,
			});

			return {
				action: 'review-queued',
				reason: 'LLM refused synthesis',
				llmCalled: true,
				durationMs: Date.now() - startedAt,
			};
		}
		if (spawn.debounced) {
			return skipped('spawn-debounced', startedAt);
		}

		return skipped('spawn-failed', startedAt);
	}

	// Branch 3 — gray band, queue for admin review.
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

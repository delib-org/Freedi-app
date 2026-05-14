import { logger } from 'firebase-functions';
import { type Statement, StatementType } from '@freedi/shared-types';
import { synthesisFlags } from '../featureFlags';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { runSinglePipeline } from '../pipeline/runSinglePipeline';

/**
 * Threshold-cross trigger.
 *
 * Fires when a Statement (option) document is updated and its evaluation
 * aggregate may have changed. We act exactly at the moment an option
 * transitions from "below threshold" to "above threshold" — never on
 * subsequent updates while it stays above.
 *
 * Why "moment of crossing" only:
 *   - The option's cluster assignment doesn't change when the evaluator
 *     count climbs from 5 to 6. We don't want to spend an LLM call per
 *     evaluation tick.
 *   - The first crossing IS the right moment because that's when the
 *     option becomes eligible for clustering under the admin's threshold.
 *
 * Falling below threshold later is intentionally ignored — clustered
 * options stay in their cluster (per design decision in the plan). The UI
 * can filter low-consensus members at render time.
 */

function isOption(statement: Statement | undefined): statement is Statement {
	return Boolean(statement && statement.statementType === StatementType.option);
}

const NUMERIC_TOLERANCE = 0.01;

export async function liveSynthOnOptionEvaluationChange(
	before: unknown,
	after: unknown,
): Promise<void> {
	if (!synthesisFlags.liveSynth) return;

	const beforeStatement = before as Statement | undefined;
	const afterStatement = after as Statement | undefined;
	if (!isOption(afterStatement)) return;
	if (!afterStatement.parentId || afterStatement.parentId === 'top') return;

	// Skip if already clustered — threshold crossings don't reassign.
	if ((afterStatement.integratedOptions ?? []).length > 0) return;

	const beforeEvals = beforeStatement?.evaluation?.numberOfEvaluators ?? 0;
	const afterEvals = afterStatement.evaluation?.numberOfEvaluators ?? 0;
	const beforeCons = beforeStatement?.consensus ?? 0;
	const afterCons = afterStatement.consensus ?? 0;

	// Cheap precheck: skip if the evaluation aggregate didn't move meaningfully.
	if (afterEvals === beforeEvals && Math.abs(afterCons - beforeCons) < NUMERIC_TOLERANCE) {
		return;
	}

	const settings = await loadSynthesisSettings(afterStatement.parentId);
	if (!settings.enabled) return;

	const wasBelow = beforeEvals < settings.minEvaluators || beforeCons < settings.minConsensus;
	const nowAbove = afterEvals >= settings.minEvaluators && afterCons >= settings.minConsensus;

	if (!(wasBelow && nowAbove)) return;

	try {
		const result = await runSinglePipeline({
			optionId: afterStatement.statementId,
			source: 'onThresholdCross',
			option: afterStatement,
		});
		logger.info('liveSynth.onThresholdCross', {
			statementId: afterStatement.statementId,
			action: result.action,
			reason: result.reason,
			durationMs: result.durationMs,
			beforeEvals,
			afterEvals,
		});
	} catch (error) {
		logger.warn('liveSynth.onThresholdCross: pipeline failed', {
			statementId: afterStatement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

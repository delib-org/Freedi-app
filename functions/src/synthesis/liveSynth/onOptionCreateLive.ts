import { logger } from 'firebase-functions';
import { type Statement, StatementType } from '@freedi/shared-types';
import { synthesisFlags } from '../featureFlags';
import { runSinglePipeline } from '../pipeline/runSinglePipeline';

/**
 * Live-synth on-create trigger.
 *
 * Fires for every newly-created option statement when the live-synth flag is
 * ON. Delegates the full decision tree to `runSinglePipeline` so the same
 * logic is shared with the threshold-cross trigger, the scheduled queue
 * worker, and the admin callables.
 *
 * The trigger still owns:
 *   - The deploy-wide kill switch (synthesisFlags.liveSynth).
 *   - Type validation (only acts on `option` statements with a non-top parent).
 *   - Membership short-circuit (don't reprocess options already in a cluster).
 *   - The `optedOutOfMerge === false` skip — when the foreground "join
 *     similar?" prompt is going to handle this option, the background trigger
 *     stays out of its way.
 *
 * Everything else (per-question gate, embedding, vector search, attach/spawn/
 * review) lives in the pipeline.
 *
 * Failure is fail-open. The trigger never throws — option creation must
 * succeed even if synthesis has a bad day.
 */

function isOption(statement: Statement | undefined): statement is Statement {
	return Boolean(statement && statement.statementType === StatementType.option);
}

export async function liveSynthOnOptionCreate(rawStatement: unknown): Promise<void> {
	if (!synthesisFlags.liveSynth) return;

	let statement: Statement;
	try {
		statement = rawStatement as Statement;
	} catch {
		return;
	}
	if (!isOption(statement)) return;
	if (!statement.parentId || statement.parentId === 'top') return;

	// Skip if already in a cluster (e.g. the foreground flow attached it first).
	if ((statement.integratedOptions ?? []).length > 0) return;

	// Foreground UI signal:
	//   - undefined / missing: trigger runs (background safety net).
	//   - true: user explicitly dismissed the foreground prompt; trigger runs.
	//   - false: user opted into the foreground merge; foreground handles it.
	const optedOutOfMergeRaw = (statement as unknown as Record<string, unknown>)['optedOutOfMerge'];
	if (optedOutOfMergeRaw === false) return;

	try {
		const result = await runSinglePipeline({
			optionId: statement.statementId,
			source: 'onCreate',
			option: statement,
		});
		logger.debug('liveSynth.onOptionCreate.pipelineResult', {
			statementId: statement.statementId,
			action: result.action,
			reason: result.reason,
			durationMs: result.durationMs,
		});
	} catch (error) {
		logger.warn('liveSynth.onOptionCreate: handler failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

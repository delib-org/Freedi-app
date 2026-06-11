import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, type Statement, StatementType } from '@freedi/shared-types';
import { synthesisFlags } from '../featureFlags';
import { runSinglePipeline } from '../pipeline/runSinglePipeline';
import { embeddingService } from '../../services/embedding-service';
import { embeddingCache } from '../../services/embedding-cache-service';

/**
 * Soft deadline for embedding generation. Past this the trigger gives up on
 * a precomputed vector and lets the pipeline call `ensureEmbedding` itself
 * (which still has the 5s wait + inline fallback). 3s matches the upper
 * end of normal text-embedding-3-small latency; anything slower probably
 * indicates a degraded OpenAI region rather than expected behavior.
 */
const EMBED_PRECOMPUTE_DEADLINE_MS = 3_000;

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

	// Pre-compute the embedding with the correct parent-text context and
	// pass it through to the pipeline. This avoids the 5s cache-wait race
	// in `ensureEmbedding`, halves the embedding-service load (the parallel
	// `generateEmbeddingForStatement` task in fn_statementCreation now sees
	// the cache populated and skips), and brings the live-synth latency
	// down from ~5-6s to ~2-3s per option in the emulator.
	let precomputed: number[] | undefined;
	let parent: Statement | undefined;
	try {
		const parentSnap = await getFirestore()
			.collection(Collections.statements)
			.doc(statement.parentId)
			.get();
		if (parentSnap.exists) {
			parent = parentSnap.data() as Statement;
			const cached = await embeddingCache.getBatchEmbeddings([statement.statementId]);
			const hit = cached.get(statement.statementId);
			if (hit && hit.length > 0) {
				precomputed = hit;
			} else {
				const deadline = Promise.race([
					embeddingService.generateEmbedding(statement.statement, parent.statement ?? ''),
					new Promise<null>((resolve) =>
						setTimeout(() => resolve(null), EMBED_PRECOMPUTE_DEADLINE_MS),
					),
				]);
				const result = (await deadline) as { embedding: number[] } | null;
				if (result?.embedding && result.embedding.length > 0) {
					precomputed = result.embedding;
					// Save it so the parallel fn_statementCreation trigger
					// finds it cached and skips its own OpenAI call.
					try {
						await embeddingCache.saveEmbedding(
							statement.statementId,
							precomputed,
							parent.statement ?? '',
							statement.statement,
						);
					} catch (saveError) {
						logger.warn('liveSynth.onOptionCreate: cache save failed (non-fatal)', {
							statementId: statement.statementId,
							error:
								saveError instanceof Error
									? saveError.message
									: String(saveError),
						});
					}
				}
			}
		}
	} catch (error) {
		// Pre-compute is an optimization — if it fails, the pipeline still
		// falls back to its own embedding resolution. Log and continue.
		logger.info('liveSynth.onOptionCreate: precompute skipped', {
			statementId: statement.statementId,
			reason: error instanceof Error ? error.message : String(error),
		});
	}

	try {
		const result = await runSinglePipeline({
			optionId: statement.statementId,
			source: 'onCreate',
			option: statement,
			parent,
			precomputedEmbedding: precomputed,
		});
		logger.debug('liveSynth.onOptionCreate.pipelineResult', {
			statementId: statement.statementId,
			action: result.action,
			reason: result.reason,
			durationMs: result.durationMs,
			hadPrecomputedEmbedding: Boolean(precomputed),
		});
	} catch (error) {
		logger.warn('liveSynth.onOptionCreate: handler failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

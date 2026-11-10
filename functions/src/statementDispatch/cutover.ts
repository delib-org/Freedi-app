import { logger } from 'firebase-functions';
import { logError } from '../utils/errorHandling';

/**
 * Hands statement events from the single-purpose triggers to the dispatcher
 * at one instant, so no event is missed or handled twice.
 *
 * Deploy order alone cannot do that. Deleting the old triggers first loses the
 * events in the gap. Deploying the dispatcher first runs both for a while, and
 * some handlers are not idempotent: fn_autoAddParagraph would add a duplicate
 * paragraph. Instead every write is assigned to one side by its commit time,
 * which is the same value for every trigger that receives that write.
 *
 * Unset means no event ever belongs to the dispatcher: it stays inert and the
 * old triggers keep working exactly as before. That is only safe while the old
 * triggers exist, so this whole module is removed in the same release as their
 * deletion: docs/scale/statement-dispatch-cutover.md, step 9.
 */
export const CUTOVER_NOT_SET = Number.POSITIVE_INFINITY;

/**
 * 2026-01-01 UTC in ms. Anything earlier cannot be a planned cutover. The usual
 * mistake is a value in seconds, which would otherwise be in the past at deploy
 * and hand every write to the dispatcher at once.
 */
export const MIN_PLAUSIBLE_CUTOVER_MS = 1_767_225_600_000;

const CUTOVER_ENV_KEY = 'STATEMENT_DISPATCH_CUTOVER_MS';

export function parseCutoverMs(raw: string | undefined): number {
	const parsed = Number(raw);

	return raw && Number.isFinite(parsed) && parsed >= MIN_PLAUSIBLE_CUTOVER_MS
		? parsed
		: CUTOVER_NOT_SET;
}

/** Cloud Run sets K_SERVICE; the emulator sets it too but also FUNCTIONS_EMULATOR. */
function isDeployedFunction(): boolean {
	return Boolean(process.env.K_SERVICE) && process.env.FUNCTIONS_EMULATOR !== 'true';
}

function loadCutoverMs(): number {
	const raw = process.env[CUTOVER_ENV_KEY];
	const cutoverMs = parseCutoverMs(raw);

	if (raw && cutoverMs === CUTOVER_NOT_SET) {
		logError(new Error(`${CUTOVER_ENV_KEY} is not a plausible time in ms`), {
			operation: 'statementDispatch.loadCutoverMs',
			metadata: { raw, minimum: MIN_PLAUSIBLE_CUTOVER_MS },
		});
	} else if (!raw && isDeployedFunction()) {
		// A warning, not logError: this module loads in every function of the
		// bundle, and unset is the expected state before the cutover release.
		logger.warn(
			`${CUTOVER_ENV_KEY} is unset: onStatementWriteDispatch is inert. The old statement ` +
				'triggers handle every write. If they have been deleted, 13 handlers are not running.',
		);
	}

	return cutoverMs;
}

export const STATEMENT_DISPATCH_CUTOVER_MS = loadCutoverMs();

/** The parts of a Firestore event that carry its commit time. */
export interface CommitTimedEvent {
	time: string;
	data?: { after?: { updateTime?: { toMillis: () => number } } };
}

/**
 * A deleted document has no `updateTime`, so a delete falls back to the event
 * time, which Firestore also sets from the write.
 */
export function eventCommitMs(event: CommitTimedEvent): number {
	return event.data?.after?.updateTime?.toMillis() ?? Date.parse(event.time);
}

/** True when this write is the dispatcher's; false when the old triggers keep it. */
export function dispatcherOwnsEvent(
	event: CommitTimedEvent,
	cutoverMs: number = STATEMENT_DISPATCH_CUTOVER_MS,
): boolean {
	return eventCommitMs(event) >= cutoverMs;
}

/** Wraps an old trigger's handler so it leaves a write alone once the dispatcher owns it. */
export function skipWhenDispatcherOwns<E extends CommitTimedEvent>(
	handler: (event: E) => unknown,
): (event: E) => Promise<unknown> {
	return async (event) => (dispatcherOwnsEvent(event) ? undefined : await handler(event));
}

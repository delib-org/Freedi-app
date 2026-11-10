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
 * old triggers keep working exactly as before.
 */
export const CUTOVER_NOT_SET = Number.POSITIVE_INFINITY;

const CUTOVER_ENV_KEY = 'STATEMENT_DISPATCH_CUTOVER_MS';

export function parseCutoverMs(raw: string | undefined): number {
	const parsed = Number(raw);

	return raw && Number.isFinite(parsed) && parsed > 0 ? parsed : CUTOVER_NOT_SET;
}

function loadCutoverMs(): number {
	const raw = process.env[CUTOVER_ENV_KEY];
	const cutoverMs = parseCutoverMs(raw);

	if (raw && cutoverMs === CUTOVER_NOT_SET) {
		logError(new Error(`${CUTOVER_ENV_KEY} is not a positive number`), {
			operation: 'statementDispatch.loadCutoverMs',
			metadata: { raw },
		});
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

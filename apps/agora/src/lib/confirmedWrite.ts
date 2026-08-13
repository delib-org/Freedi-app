import m from 'mithril';

/**
 * A write that never lands never rejects either.
 *
 * Firestore answers from the local cache before the write leaves the device and
 * then queues it, so on a wedged connection there is no error to catch and no
 * promise to lose — just silence. The only honest way to tell a student their
 * work is not saved is a clock.
 *
 * The first proposal has had that clock since the playtest bug (the write desk
 * holds the student and offers a reload). Every other write in the lesson —
 * editing your proposal, rating a classmate, sending a message into a thread —
 * was fire-and-forget. On a saturated classroom AP that means a student weaves
 * a classmate's idea into their proposal, the UI says saved, the weave credit
 * never lands, and the classmate is never thanked. Silent, and worse than an
 * error because nobody knows to retry.
 *
 * This is the same clock, made shared. Writes register here; anything still in
 * the air after `SLOW_AFTER_MS` is surfaced by the HUD.
 */

/** How long a write may stay in the air before we say so. */
export const SLOW_AFTER_MS = 8000;

export interface StalledWrite {
	/** i18n key describing what is stuck, in the student's own terms. */
	labelKey: string;
	since: number;
}

let nextId = 1;
const inFlight = new Map<number, { labelKey: string; started: number; timer: number }>();
const stalled = new Map<number, StalledWrite>();

/**
 * What is currently stuck, oldest first. Empty almost always — this exists so
 * the HUD can say something on the one lesson where the wifi gives out.
 */
export function getStalledWrites(): StalledWrite[] {
	return [...stalled.values()].sort((a, b) => a.since - b.since);
}

/**
 * Run a write under the clock.
 *
 * Resolves and rejects exactly as the wrapped promise does — callers that
 * already handle failure keep working unchanged. The only added behaviour is
 * that a write still outstanding after SLOW_AFTER_MS becomes visible, and stops
 * being visible the moment it settles either way.
 */
export async function trackWrite<T>(labelKey: string, write: Promise<T>): Promise<T> {
	const id = nextId++;
	const started = Date.now();

	const timer = window.setTimeout(() => {
		stalled.set(id, { labelKey, since: started });
		m.redraw();
	}, SLOW_AFTER_MS);

	inFlight.set(id, { labelKey, started, timer });

	try {
		return await write;
	} finally {
		window.clearTimeout(timer);
		inFlight.delete(id);
		// Only redraw if this write had actually been surfaced; the common case
		// (a write that lands promptly) must not cost a render.
		if (stalled.delete(id)) m.redraw();
	}
}

/**
 * Drop all tracking. Called when the deliberation listeners are torn down, so
 * a stalled write from a finished session cannot haunt the next one.
 */
export function clearWriteTracking(): void {
	inFlight.forEach((entry) => window.clearTimeout(entry.timer));
	inFlight.clear();
	stalled.clear();
}

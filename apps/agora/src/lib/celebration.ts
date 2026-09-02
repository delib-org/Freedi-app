import m from 'mithril';

export interface CelebrationPayload {
	/** Main celebratory line, already translated */
	message: string;
	/** The improvement itself, quoted in the popup */
	detail?: string;
	/**
	 * What happens NEXT, in one line. The accept celebration has no action
	 * button by design — the text hasn't changed yet — which used to make it
	 * the one good-news moment that led nowhere. The hint fills that gap:
	 * it teaches the +1 → +2 ladder exactly when the helper cares most.
	 */
	hint?: string;
	/**
	 * Optional continuation: the celebration is a fork in the loop, not a
	 * dead end. Runs on click, then the popup dismisses itself.
	 */
	action?: { label: string; run: () => void };
	/**
	 * The rare moments that are heard as well as seen. Left off everywhere
	 * else on purpose: thirty devices in one room means a sound has to earn
	 * its place, and one that plays for everything earns nothing.
	 */
	sound?: 'applause';
}

let current: CelebrationPayload | null = null;
/**
 * Moments still waiting their turn.
 *
 * These used to overwrite each other — "latest wins" — which was fine while
 * they arrived minutes apart and quietly destructive once they didn't. One
 * rating can now land a proposal in the bridge zone AND pay its bridging tier
 * in the same breath, and the student saw exactly one of the two, at random.
 * A reward the game decided to give and then swallowed is worse than one it
 * never promised.
 */
const pending: CelebrationPayload[] = [];
/** A pile-up is its own punishment; past this the oldest waiting ones go */
const MAX_PENDING = 3;

export function getCelebration(): CelebrationPayload | null {
	return current;
}

/** Fire the glitter popup — one at a time, the rest wait their turn */
export function celebrate(payload: CelebrationPayload): void {
	// The same moment announced twice (a re-delivered trigger, a redraw that
	// re-ran a detector) is one moment
	const isDuplicate = (other: CelebrationPayload | null): boolean =>
		other !== null && other.message === payload.message && other.detail === payload.detail;
	if (isDuplicate(current) || pending.some(isDuplicate)) return;

	if (current) {
		pending.push(payload);
		if (pending.length > MAX_PENDING) pending.shift();

		return;
	}
	current = payload;
	m.redraw();
}

export function dismissCelebration(): void {
	current = pending.shift() ?? null;
	m.redraw();
}

/**
 * Keys whose one-shot celebration already fired this sitting. The in-memory
 * set is the real guard — it also covers a browser whose sessionStorage
 * throws — and sessionStorage extends it across a refresh, because a cheer
 * that repeats on every reload stops meaning anything.
 */
const firedOnce = new Set<string>();

/**
 * Fire a celebration at most once per key (per sitting, refresh included).
 * The storage lives HERE rather than in the component that wants the cheer:
 * components produce vnodes from props and never touch storage — that rule
 * is what keeps them testable in node.
 */
export function celebrateOnce(key: string, payload: CelebrationPayload): void {
	if (firedOnce.has(key)) return;
	try {
		if (sessionStorage.getItem(key)) {
			firedOnce.add(key);

			return;
		}
	} catch {
		// Storage unavailable — the in-memory set still guards this sitting
	}
	firedOnce.add(key);
	try {
		sessionStorage.setItem(key, '1');
	} catch {
		// Nothing to do — the cheer just repeats after a refresh
	}
	celebrate(payload);
}

/**
 * A sub-page the phone's back gesture should close.
 *
 * A conversation in the square takes the whole screen, but it is not a route —
 * Mithril's URL stays where it is. Without a history entry, a student pressing
 * back to leave a thread leaves the GAME instead, mid-lesson, and lands back on
 * the join screen. So opening one pushes an entry and closing one unwinds it.
 *
 * The dance is small and entirely about ordering: close-by-back must not push
 * back again, close-by-button must, and a stale entry must never be unwound
 * twice. It lived inline in a 2,899-line view where the only way to check it
 * was to drive a real browser.
 *
 * The history API is injected rather than reached for, so the ordering can be
 * tested without one.
 */

export interface HistoryLike {
	readonly state: unknown;
	pushState(state: unknown, title: string): void;
	back(): void;
}

export interface SubPageDeps<T> {
	history: HistoryLike;
	/** Subscribe to popstate; returns the unsubscribe. */
	onPopState(handler: () => void): () => void;
	/** Something changed and the screen should be redrawn. */
	onChange(open: T | null): void;
}

export interface SubPage<T> {
	current(): T | null;
	open(value: T): void;
	/** Close from a button or gesture inside the app — unwinds the history entry. */
	close(): void;
	/** Stop listening. Call from the view's onremove. */
	dispose(): void;
}

/** Marks the entries this module pushed, so we never unwind someone else's. */
const MARKER = 'agoraSubPage';

export function createSubPage<T>(deps: SubPageDeps<T>): SubPage<T> {
	let open: T | null = null;

	const closeFromHistory = (): void => {
		if (!open) return;
		open = null;
		deps.onChange(null);
	};

	const unsubscribe = deps.onPopState(closeFromHistory);

	return {
		current: () => open,

		open(value: T) {
			open = value;
			try {
				deps.history.pushState({ [MARKER]: true }, '');
			} catch {
				// No history access (rare sandboxes). The sub-page still opens;
				// only the back gesture is degraded, which beats not opening.
			}
			deps.onChange(value);
		},

		close() {
			if (!open) return;
			open = null;
			try {
				// Only unwind an entry WE pushed. Calling back() unconditionally
				// would walk the student out of the game whenever the push had
				// failed or the entry had already been consumed.
				const state = deps.history.state as Record<string, unknown> | null;
				if (state?.[MARKER] === true) deps.history.back();
			} catch {
				// Nothing to unwind
			}
			deps.onChange(null);
		},

		dispose() {
			unsubscribe();
		},
	};
}

/** The real browser wiring, kept in one place so views never touch history. */
export function browserSubPageDeps<T>(onChange: (open: T | null) => void): SubPageDeps<T> {
	return {
		history: window.history,
		onPopState(handler) {
			window.addEventListener('popstate', handler);

			return () => window.removeEventListener('popstate', handler);
		},
		onChange,
	};
}

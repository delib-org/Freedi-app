/**
 * The one piece of state behind consulting the crew on an island: which
 * disclosure is open. One across the whole panel, never two — a sailor's
 * island card, or one shore's crew row (with at most one sailor's card in
 * it). Nothing here is persisted; the island changing resets it to null.
 *
 * Pure transitions, so the rules in docs/design/odyssey-crew-counsel-ux.md §4
 * can be tested without a DOM.
 */

export type CounselState =
	| null
	| { scope: 'island'; elderId: string }
	| { scope: 'shore'; stanceId: string; elderId: string | null };

/** Tap a sailor in the island row: open their card, or close it if it is the open one. */
export function toggleIslandSailor(state: CounselState, elderId: string): CounselState {
	if (state?.scope === 'island' && state.elderId === elderId) return null;

	return { scope: 'island', elderId };
}

/** Tap a shore's counsel line: open its crew row (closing anything else), or fold it. */
export function toggleShoreRow(state: CounselState, stanceId: string): CounselState {
	if (state?.scope === 'shore' && state.stanceId === stanceId) return null;

	return { scope: 'shore', stanceId, elderId: null };
}

/**
 * Tap a sailor in a shore's row: open their card, or close it if it is the
 * open one. The row itself stays open either way.
 */
export function toggleShoreSailor(
	state: CounselState,
	stanceId: string,
	elderId: string,
): CounselState {
	const sameSailor =
		state?.scope === 'shore' && state.stanceId === stanceId && state.elderId === elderId;

	return { scope: 'shore', stanceId, elderId: sameSailor ? null : elderId };
}

/** The sailor whose island card is open, if any. */
export function openIslandSailor(state: CounselState): string | null {
	return state?.scope === 'island' ? state.elderId : null;
}

/** Whether this shore's crew row is open. */
export function isShoreRowOpen(state: CounselState, stanceId: string): boolean {
	return state?.scope === 'shore' && state.stanceId === stanceId;
}

/** The sailor whose card is open in this shore's row, if any. */
export function openShoreSailor(state: CounselState, stanceId: string): string | null {
	return isShoreRowOpen(state, stanceId) && state?.scope === 'shore' ? state.elderId : null;
}

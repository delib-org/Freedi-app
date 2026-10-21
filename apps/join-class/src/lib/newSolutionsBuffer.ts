/**
 * "New solutions arrived" buffer — mirrors the main app's
 * `useNewSolutionsBuffer` logic so the join app can show a "X new" pill
 * and a highlight ring on freshly arrived options without surprising the
 * user mid-evaluation.
 *
 * Two phases:
 *   1. Stabilize window (3 s): every arriving ID is marked "known" so the
 *      initial Firestore snapshot and any catch-up snapshots don't produce
 *      false-positive highlights.
 *   2. After stabilize: IDs not in `bufferKnownIds` go to `bufferPendingIds`
 *      (the "X new" pill). Flushing moves them to `bufferHighlightedIds`
 *      for HIGHLIGHT_MS, then they auto-clear.
 *
 * Carved out of store.ts so the lifecycle is legible and so changes here
 * can't bleed into evaluation / chat / membership concerns.
 */

import m from 'mithril';

const BUFFER_STABILIZE_MS = 3_000;
const BUFFER_HIGHLIGHT_MS = 10_000;

let bufferKnownIds = new Set<string>();
let bufferPendingIds = new Set<string>();
let bufferHighlightedIds = new Set<string>();
let bufferStabilized = false;
let bufferStabilizeTimer: ReturnType<typeof setTimeout> | null = null;
const bufferHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reset all buffer state for a fresh question session. Call at the start of
 * each `subscribeOptions` invocation so the previous question's pending /
 * highlighted state doesn't leak.
 */
export function resetNewSolutionsBuffer(): void {
	bufferKnownIds = new Set<string>();
	bufferPendingIds = new Set<string>();
	bufferHighlightedIds = new Set<string>();
	bufferStabilized = false;
	if (bufferStabilizeTimer !== null) clearTimeout(bufferStabilizeTimer);
	for (const t of bufferHighlightTimers.values()) clearTimeout(t);
	bufferHighlightTimers.clear();

	bufferStabilizeTimer = setTimeout(() => {
		bufferStabilized = true;
		bufferStabilizeTimer = null;
	}, BUFFER_STABILIZE_MS);
}

/**
 * Process one incoming option from the snapshot. Decides whether it counts
 * as "newly arrived" or should be silently added to the known set. The
 * caller is responsible for redrawing once a batch has been processed.
 */
export function ingestOptionForBuffer(
	optionId: string,
	creatorId: string | undefined,
	currentUid: string | undefined,
): void {
	if (!bufferStabilized || creatorId === currentUid) {
		// Warm-up OR own submission: appear immediately. Own newly-submitted
		// options skip the pill but still get the highlight ring.
		if (bufferStabilized && creatorId === currentUid && !bufferKnownIds.has(optionId)) {
			highlightForDuration(optionId);
		}
		bufferKnownIds.add(optionId);

		return;
	}

	if (!bufferKnownIds.has(optionId) && !bufferPendingIds.has(optionId)) {
		// Genuinely new option from another user — queue it for the pill.
		bufferPendingIds.add(optionId);
	} else {
		bufferKnownIds.add(optionId);
	}
}

function highlightForDuration(optionId: string): void {
	bufferHighlightedIds.add(optionId);
	if (bufferHighlightTimers.has(optionId)) {
		clearTimeout(bufferHighlightTimers.get(optionId)!);
	}
	const timer = setTimeout(() => {
		bufferHighlightedIds.delete(optionId);
		bufferHighlightTimers.delete(optionId);
		m.redraw();
	}, BUFFER_HIGHLIGHT_MS);
	bufferHighlightTimers.set(optionId, timer);
}

/** Count of options currently waiting in the pill. */
export function getNewOptionsPendingCount(): number {
	return bufferPendingIds.size;
}

/** True iff this option is currently in the highlight set. */
export function isOptionNewlyArrived(optionId: string): boolean {
	return bufferHighlightedIds.has(optionId);
}

/** True iff this option is currently pending (filtered out of the visible list). */
export function isOptionPending(optionId: string): boolean {
	return bufferPendingIds.has(optionId);
}

/** True iff this option is currently highlighted (pin-to-top during HIGHLIGHT_MS). */
export function isOptionHighlighted(optionId: string): boolean {
	return bufferHighlightedIds.has(optionId);
}

/**
 * Drop a single option from the highlight set. Used when the option is
 * dismissed by an explicit user action (e.g. evaluating it) so its FLIP
 * animation can move it to its natural sorted position.
 */
export function unhighlightOption(optionId: string): void {
	if (!bufferHighlightedIds.has(optionId)) return;
	bufferHighlightedIds.delete(optionId);
	const t = bufferHighlightTimers.get(optionId);
	if (t !== undefined) {
		clearTimeout(t);
		bufferHighlightTimers.delete(optionId);
	}
}

/** Flush pending → highlighted. Triggered when the user clicks the "X new" pill. */
export function flushNewOptions(): void {
	for (const id of bufferPendingIds) {
		bufferKnownIds.add(id);
		highlightForDuration(id);
	}
	bufferPendingIds = new Set<string>();
	m.redraw();
}

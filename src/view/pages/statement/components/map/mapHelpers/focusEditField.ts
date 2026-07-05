/**
 * Ref callback for a map edit field (note text or cluster title).
 *
 * Focuses the field when it opens on pointer (mouse/pen) devices so the user can
 * type immediately. On touch devices it does nothing: there the browser scrolls
 * the focused field into view and opens the keyboard, which yanks the map
 * viewport out from under the user (the "tapping a note steals the viewport"
 * bug). Touch users tap the field themselves to bring up the keyboard when ready.
 *
 * Passed as a stable module-level ref so React invokes it once when the field
 * mounts (edit begins), not on every re-render.
 */
export function focusEditField(el: HTMLTextAreaElement | null): void {
	if (!el) return;
	const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
	if (coarsePointer) return;
	el.focus({ preventScroll: true });
	el.select();
}

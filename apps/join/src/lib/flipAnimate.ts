// Vanilla FLIP (First, Last, Invert, Play) for animated reorders in keyed
// Mithril lists. Each animated child must carry a `data-flip-id` attribute
// with a stable identifier (e.g. statementId).
//
// Usage:
//   const before = captureFlipPositions(listEl);
//   // ...DOM gets patched / reordered...
//   playFlipAnimation(listEl, before);

const FLIP_ATTR = 'data-flip-id';

/** Snapshot the bounding rect of every direct or descendant child carrying
 *  `data-flip-id`. Returns a map keyed by id. Safe to call before the DOM is
 *  patched. */
export function captureFlipPositions(container: HTMLElement): Map<string, DOMRect> {
	const rects = new Map<string, DOMRect>();
	const nodes = container.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`);
	for (const el of nodes) {
		const id = el.getAttribute(FLIP_ATTR);
		if (!id) continue;
		rects.set(id, el.getBoundingClientRect());
	}

	return rects;
}

/** Compare new positions against `oldRects`, apply an inverse transform to any
 *  element that moved more than 1px, then release on the next animation frame
 *  so the existing CSS transition animates it back to the new position.
 *
 *  Honors `prefers-reduced-motion: reduce` (no-op when set). */
export function playFlipAnimation(container: HTMLElement, oldRects: Map<string, DOMRect>): void {
	if (typeof window === 'undefined') return;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

	const moved: HTMLElement[] = [];
	const nodes = container.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`);

	for (const el of nodes) {
		const id = el.getAttribute(FLIP_ATTR);
		if (!id) continue;
		const oldRect = oldRects.get(id);
		if (!oldRect) continue;

		const newRect = el.getBoundingClientRect();
		const dx = oldRect.left - newRect.left;
		const dy = oldRect.top - newRect.top;
		if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;

		// Phase 1 (Invert): jump back to where we were, transitions off.
		el.classList.add('solution-card--flipping');
		el.style.transform = `translate(${dx}px, ${dy}px)`;
		moved.push(el);
	}

	if (moved.length === 0) return;

	// Phase 2 (Play): on the next frame, drop the inline transform and the
	// transition-off class. The existing `.solution-card { transition:
	// transform var(--dur-base) var(--ease-out) }` rule animates the card
	// back to its real position.
	requestAnimationFrame(() => {
		// Force a layout read so the browser commits Phase 1 before we strip it.
		void container.offsetHeight;
		for (const el of moved) {
			el.classList.remove('solution-card--flipping');
			el.style.transform = '';
		}
	});
}

/**
 * FLIP glide for a keyed list that re-orders in place: record each child's
 * position before the redraw, then slide every moved child from its old spot to
 * its new one. Children are matched by `data-key`. Skipped entirely under
 * prefers-reduced-motion. Duration and easing come from the motion tokens
 * (--dur-reorder, --ease-out) so the glide matches the rest of the app.
 */

const FALLBACK_DURATION_MS = 560;
const FALLBACK_EASING = 'ease-out';
const MS_PER_SECOND = 1000;
/** Moves smaller than this (sub-pixel layout jitter) are not animated. */
const MIN_MOVE_PX = 1;

export type Positions = Map<string, number>;

function reducedMotion(): boolean {
	return typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;
}

function keyedChildren(container: Element): HTMLElement[] {
	return Array.from(container.children).filter(
		(child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.key,
	);
}

/** CSS time ("560ms" / "0.56s") to milliseconds; null when unreadable. */
export function parseCssTime(value: string): number | null {
	const text = value.trim();
	const amount = Number.parseFloat(text);
	if (!Number.isFinite(amount)) return null;
	if (text.endsWith('ms')) return amount;
	if (text.endsWith('s')) return amount * MS_PER_SECOND;

	return null;
}

/** Top edge of every keyed child, taken before the DOM changes. */
export function recordPositions(container: Element | null | undefined): Positions {
	const positions: Positions = new Map();
	if (!container) return positions;
	for (const child of keyedChildren(container)) {
		positions.set(child.dataset.key as string, child.getBoundingClientRect().top);
	}

	return positions;
}

/** Slide each child that moved from where it was to where it is now. */
export function playFlip(container: Element | null | undefined, before: Positions): void {
	if (!container || before.size === 0 || reducedMotion()) return;
	const style = getComputedStyle(container);
	const duration = parseCssTime(style.getPropertyValue('--dur-reorder')) ?? FALLBACK_DURATION_MS;
	if (duration <= 0) return;
	const easing = style.getPropertyValue('--ease-out').trim() || FALLBACK_EASING;
	for (const child of keyedChildren(container)) {
		const was = before.get(child.dataset.key as string);
		if (was === undefined || typeof child.animate !== 'function') continue;
		const delta = was - child.getBoundingClientRect().top;
		if (Math.abs(delta) < MIN_MOVE_PX) continue;
		child.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
			duration,
			easing,
		});
	}
}

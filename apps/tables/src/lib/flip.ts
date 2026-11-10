/**
 * FLIP motion for the rank list: remember where each row was, let the list
 * change, then slide every row that moved from its old place to its new one.
 * Only `transform` and `opacity` are animated. Nothing runs for people who
 * ask for reduced motion.
 */

/** How long a row glides to its new place. */
export const FLIP_DURATION_MS = 320;
/** Decelerating curve with no overshoot: the row settles, it does not bounce. */
export const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** How long the landing highlight takes to fade in and out. */
export const LANDED_DURATION_MS = 700;
/** The highlight's strongest opacity: a hint of the brand colour, not a flash. */
export const LANDED_PEAK_OPACITY = 0.22;
/** Where in the highlight's run its strongest point falls (0-1). */
export const LANDED_PEAK_OFFSET = 0.35;
/** Marks our animations, so they can be found and cancelled. */
export const FLIP_ANIMATION_ID = 'rank-flip';
/** Pixel differences below this are layout rounding, not movement. */
const MIN_MOVE_PX = 0.5;

export type RowTops = Map<string, number>;

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Top edge of each row, by key, as drawn right now (a running slide counts). */
export function measureTops(rows: ReadonlyMap<string, HTMLElement>): RowTops {
	const tops: RowTops = new Map();

	rows.forEach((row, key) => tops.set(key, row.getBoundingClientRect().top));

	return tops;
}

/** Stop any slide still running on these rows, so a new one starts clean. */
export function cancelFlips(rows: Iterable<HTMLElement>): void {
	for (const row of rows) {
		if (typeof row.getAnimations !== 'function') continue;
		row
			.getAnimations()
			.filter((animation) => animation.id === FLIP_ANIMATION_ID)
			.forEach((animation) => animation.cancel());
	}
}

/** How far each row must travel back to its old place: old top minus new top. Rows that did not move are left out. */
export function flipDeltas(first: RowTops, last: RowTops): Map<string, number> {
	const deltas = new Map<string, number>();

	last.forEach((top, key) => {
		const before = first.get(key);

		if (before === undefined) return;

		const delta = before - top;

		if (Math.abs(delta) >= MIN_MOVE_PX) deltas.set(key, delta);
	});

	return deltas;
}

/** Slide one row from `delta` pixels away to where it is. */
export function playSlide(row: HTMLElement, delta: number): Animation | null {
	if (typeof row.animate !== 'function') return null;

	return row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
		duration: FLIP_DURATION_MS,
		easing: FLIP_EASING,
		id: FLIP_ANIMATION_ID,
	});
}

/** A soft highlight on the row that just landed (fades in and out, opacity only). */
export function playLanded(glow: HTMLElement): Animation | null {
	if (typeof glow.animate !== 'function') return null;

	return glow.animate(
		[{ opacity: 0 }, { opacity: LANDED_PEAK_OPACITY, offset: LANDED_PEAK_OFFSET }, { opacity: 0 }],
		{ duration: LANDED_DURATION_MS, easing: 'ease-out' },
	);
}

/**
 * Play the whole move: every row in `deltas` slides, and the landing row, when
 * it has a highlight element, glows. Does nothing (rows simply jump) when
 * reduced motion is requested.
 */
export function playFlip(
	rows: ReadonlyMap<string, HTMLElement>,
	deltas: ReadonlyMap<string, number>,
	landedKey: string | null,
	glowOf: (row: HTMLElement) => HTMLElement | null,
	reduced: boolean = prefersReducedMotion(),
): void {
	if (reduced) return;

	deltas.forEach((delta, key) => {
		const row = rows.get(key);

		if (row) playSlide(row, delta);
	});

	const landed = landedKey ? rows.get(landedKey) : undefined;
	const glow = landed ? glowOf(landed) : null;

	if (glow) playLanded(glow);
}

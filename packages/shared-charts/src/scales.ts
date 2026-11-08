export type LinearScale = (value: number) => number;

/**
 * Map `[d0, d1]` onto `[r0, r1]` linearly. A degenerate domain (d0 === d1)
 * pins everything to `r0` instead of dividing by zero.
 */
export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0;
	if (span === 0) return () => r0;
	const k = (r1 - r0) / span;

	return (value: number): number => r0 + (value - d0) * k;
}

export interface BandScale {
	/** Distance between the starts of two adjacent bands. */
	step: number;
	/** Drawable width of one band (step minus the gap). */
	bandWidth: number;
	/** Start coordinate of band `i`. */
	start(i: number): number;
	/** Centre coordinate of band `i`. */
	center(i: number): number;
}

/**
 * Split `[r0, r1]` into `count` equal bands with `gap` units between them.
 * The first band starts at `r0` and the last one ends at `r1`.
 */
export function bandScale(count: number, range: [number, number], gap: number): BandScale {
	const [r0, r1] = range;
	if (count <= 0) {
		return { step: 0, bandWidth: 0, start: () => r0, center: () => r0 };
	}
	const totalGap = gap * (count - 1);
	const bandWidth = Math.max(0, (r1 - r0 - totalGap) / count);
	const step = bandWidth + gap;

	return {
		step,
		bandWidth,
		start: (i: number) => r0 + i * step,
		center: (i: number) => r0 + i * step + bandWidth / 2,
	};
}

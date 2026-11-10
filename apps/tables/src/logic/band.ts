import { SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';

/** Where a group's positions sit on the 0..100 axis: mean plus and minus one spread, as percents. */
export interface Band {
	start: number;
	width: number;
}

function clamp(value: number): number {
	return Math.min(SIDE_MAX, Math.max(SIDE_MIN, value));
}

export function bandOf(mean: number, sd: number): Band {
	const start = clamp(mean - sd);

	return { start, width: clamp(mean + sd) - start };
}

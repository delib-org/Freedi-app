/**
 * Where the floating accessibility tab may sit so it never covers something the user can press.
 * Pure: the widget supplies `isBlocked(top)` (is something interactive under the tab if its top
 * were here?), this scans for the nearest free spot: the current one first, then downward in
 * `step` px, then upward. Null when the whole edge is taken, and the tab stays where it is.
 */
export function firstClearTop(
	start: number,
	step: number,
	min: number,
	max: number,
	isBlocked: (top: number) => boolean,
): number | null {
	if (!isBlocked(start)) return start;
	for (let top = start + step; top <= max; top += step) {
		if (!isBlocked(top)) return top;
	}
	for (let top = start - step; top >= min; top -= step) {
		if (!isBlocked(top)) return top;
	}

	return null;
}

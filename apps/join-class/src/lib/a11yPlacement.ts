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

/** Per device (not per user): where the tab was last dragged to. */
export const A11Y_TOP_STORAGE_KEY = 'a11yWidgetTop';

/** Keeps the tab fully inside the viewport, whatever size the screen is now. */
export function clampTop(
	top: number,
	viewportHeight: number,
	min: number,
	bottomGap: number,
): number {
	return Math.min(Math.max(top, min), Math.max(min, viewportHeight - bottomGap));
}

/** The saved position, or null when there is none (or storage is blocked). */
export function readSavedTop(storage: Pick<Storage, 'getItem'> | null): number | null {
	try {
		const raw = storage?.getItem(A11Y_TOP_STORAGE_KEY);
		if (raw === null || raw === undefined) return null;
		const value = Number(raw);

		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

export function saveTop(storage: Pick<Storage, 'setItem'> | null, top: number): void {
	try {
		storage?.setItem(A11Y_TOP_STORAGE_KEY, String(Math.round(top)));
	} catch {
		// private mode or blocked storage: the tab simply starts from its default next time
	}
}

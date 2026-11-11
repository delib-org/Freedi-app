/**
 * The room screen shows a page of tables at a time and moves on by itself.
 * A page starts as big as the projector allows; a table that does not fit
 * makes the screen take a smaller page, never a clipped one.
 */

const WIDE_SCREEN_PX = 1100;
const MEDIUM_SCREEN_PX = 700;
const WIDE_COLUMNS = 3;
const MEDIUM_COLUMNS = 2;
const NARROW_COLUMNS = 1;
const ROWS_PER_PAGE = 2;

export function columnsForWidth(widthPx: number): number {
	if (widthPx >= WIDE_SCREEN_PX) return WIDE_COLUMNS;

	return widthPx >= MEDIUM_SCREEN_PX ? MEDIUM_COLUMNS : NARROW_COLUMNS;
}

export function largestPageSize(widthPx: number): number {
	return columnsForWidth(widthPx) * ROWS_PER_PAGE;
}

export function pageCount(items: number, pageSize: number): number {
	return Math.max(1, Math.ceil(items / Math.max(1, pageSize)));
}

export function pageItems<T>(items: readonly T[], page: number, pageSize: number): T[] {
	const size = Math.max(1, pageSize);
	const last = pageCount(items.length, size) - 1;
	const start = Math.min(page, last) * size;

	return items.slice(start, start + size);
}

export function nextPage(page: number, pages: number): number {
	return (page + 1) % Math.max(1, pages);
}

export function previousPage(page: number, pages: number): number {
	const total = Math.max(1, pages);

	return (page - 1 + total) % total;
}

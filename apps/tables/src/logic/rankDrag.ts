/**
 * The arithmetic of dragging a picked topic. While the finger moves nothing is
 * reordered: the row follows it and the rows it passes step aside. The list
 * changes once, on release, because moving a DOM node under a finger can
 * end the touch on some phones.
 */
export interface RowBox {
	top: number;
	height: number;
}

function middle(box: RowBox): number {
	return box.top + box.height / 2;
}

/** Keep the dragged row between the first and the last picked row. */
export function clampDragOffset(rows: readonly RowBox[], from: number, offset: number): number {
	const moved = rows[from];
	const last = rows[rows.length - 1];
	const lowest = rows[0].top - moved.top;
	const highest = last.top + last.height - moved.height - moved.top;

	return Math.min(highest, Math.max(lowest, offset));
}

/** The place the row would take if released now: past every row whose middle it crossed. */
export function dragTargetIndex(rows: readonly RowBox[], from: number, offset: number): number {
	const moved = rows[from];
	const top = moved.top + offset;
	const bottom = top + moved.height;
	let target = from;

	for (let i = from + 1; i < rows.length && bottom > middle(rows[i]); i += 1) target = i;
	for (let i = from - 1; i >= 0 && top < middle(rows[i]); i -= 1) target = i;

	return target;
}

/** How far (px) a row stands aside while another one is dragged over it. */
export function displacement(index: number, from: number, target: number, step: number): number {
	if (from < target && index > from && index <= target) return -step;
	if (target < from && index >= target && index < from) return step;

	return 0;
}

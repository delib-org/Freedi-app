export interface Point {
	x: number;
	y: number;
}

export interface Corners {
	tl: boolean;
	tr: boolean;
	br: boolean;
	bl: boolean;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

export function linePath(points: Point[]): string {
	if (points.length === 0) return '';

	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join(' ');
}

export function areaPath(points: Point[], baseY: number): string {
	if (points.length === 0) return '';
	const first = points[0];
	const last = points[points.length - 1];

	return `${linePath(points)} L${n(last.x)} ${n(baseY)} L${n(first.x)} ${n(baseY)} Z`;
}

/**
 * A rectangle with an independent radius decision per corner. Used for bars
 * (rounded only on the data end) and for stacked segments (square where they
 * meet a neighbour).
 */
export function roundedRectPath(
	x: number,
	y: number,
	w: number,
	h: number,
	rx: number,
	corners: Corners,
): string {
	const r = Math.max(0, Math.min(rx, w / 2, h / 2));
	const right = x + w;
	const bottom = y + h;
	const tl = corners.tl ? r : 0;
	const tr = corners.tr ? r : 0;
	const br = corners.br ? r : 0;
	const bl = corners.bl ? r : 0;
	const arc = (rr: number, ex: number, ey: number): string => (rr > 0 ? `A${n(rr)} ${n(rr)} 0 0 1 ${n(ex)} ${n(ey)}` : '');

	return [
		`M${n(x + tl)} ${n(y)}`,
		`L${n(right - tr)} ${n(y)}`,
		arc(tr, right, y + tr),
		`L${n(right)} ${n(bottom - br)}`,
		arc(br, right - br, bottom),
		`L${n(x + bl)} ${n(bottom)}`,
		arc(bl, x, bottom - bl),
		`L${n(x)} ${n(y + tl)}`,
		arc(tl, x + tl, y),
		'Z',
	]
		.filter(Boolean)
		.join(' ');
}

export function roundedTopRectPath(x: number, y: number, w: number, h: number, rx: number): string {
	return roundedRectPath(x, y, w, h, rx, { tl: true, tr: true, br: false, bl: false });
}

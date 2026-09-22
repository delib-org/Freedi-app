import { formatNumber } from '../format';
import { roundedRectPath } from '../paths';
import type { ChartGeometry, ChartSpec, Hit, LayoutContext, Primitive } from '../types';
import { BAR_RX, slotClass } from './frame';
import { describeChart } from '../a11y';

type StripSpec = Extract<ChartSpec, { kind: 'strip' }>;

const PERCENT = 100;

/**
 * A single horizontal bar split proportionally. Part widths sum to exactly
 * the plot width; the visual gap between parts is the surface-coloured
 * stroke in the stylesheet. RTL grows from the right edge.
 */
export function layoutStrip(spec: StripSpec, ctx: LayoutContext): ChartGeometry {
	const { plot, dir } = ctx;
	const rtl = dir === 'rtl';
	const parts = spec.parts.map((p) => ({ ...p, value: Math.max(0, Number.isFinite(p.value) ? p.value : 0) }));
	const total = parts.reduce((sum, p) => sum + p.value, 0);
	const primitives: Primitive[] = [];
	const hits: Hit[] = [];
	const drawn = parts.map((p, i) => ({ ...p, index: i })).filter((p) => p.value > 0);

	if (total === 0) {
		primitives.push({
			type: 'path',
			cls: slotClass('strip-part', 'muted'),
			d: roundedRectPath(plot.x, plot.y, plot.w, plot.h, BAR_RX, { tl: true, tr: true, br: true, bl: true }),
			box: { x: plot.x, y: plot.y, w: plot.w, h: plot.h },
		});
	}

	let cursor = 0;
	drawn.forEach((part, j) => {
		const w = (part.value / total) * plot.w;
		const x = rtl ? plot.x + plot.w - cursor - w : plot.x + cursor;
		cursor += w;
		const first = j === 0;
		const last = j === drawn.length - 1;
		const roundStart = rtl ? { tr: first, br: first } : { tl: first, bl: first };
		const roundEnd = rtl ? { tl: last, bl: last } : { tr: last, br: last };
		primitives.push({
			type: 'path',
			cls: slotClass('strip-part', part.slot),
			d: roundedRectPath(x, plot.y, w, plot.h, BAR_RX, { tl: false, tr: false, br: false, bl: false, ...roundStart, ...roundEnd }),
			hit: part.index,
			box: { x, y: plot.y, w, h: plot.h },
		});
		hits.push({
			index: part.index,
			x,
			y: plot.y,
			w,
			h: plot.h,
			label: part.label,
			lines: [
				{
					label: part.label,
					value: `${formatNumber(part.value, ctx.locale)} (${formatNumber((part.value / total) * PERCENT, ctx.locale, 0)}%)`,
					slot: part.slot,
				},
			],
		});
	});

	const table = {
		head: ['', ''],
		rows: parts.map((p) => [p.label, formatNumber(p.value, ctx.locale)]),
	};

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot,
		primitives,
		hits,
		legend: parts.map((p) => ({ label: p.label, slot: p.slot, icon: p.icon })),
		a11y: { desc: describeChart(spec, table), table },
	};
}

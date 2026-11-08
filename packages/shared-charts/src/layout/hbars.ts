import { roundedRectPath } from '../paths';
import { bandScale } from '../scales';
import type { ChartGeometry, ChartSpec, Hit, LayoutContext, Primitive } from '../types';
import { BAR_RX, TICK_GAP, slotClass } from './frame';
import { formatValue } from './line';
import { describeChart } from '../a11y';

type HBarsSpec = Extract<ChartSpec, { kind: 'hbars' }>;

const ROW_GAP = 6;
const LABEL_GAP = 8;

export function layoutHBars(spec: HBarsSpec, ctx: LayoutContext): ChartGeometry {
	const { plot, dir } = ctx;
	const rtl = dir === 'rtl';
	const values = spec.rows.map((r) => r.value).filter((v): v is number => v !== null && Number.isFinite(v));
	const chartMax = Math.max(1, ...values);
	const band = bandScale(spec.rows.length, [plot.y, plot.y + plot.h], ROW_GAP);
	const primitives: Primitive[] = [];
	const hits: Hit[] = [];

	spec.rows.forEach((row, i) => {
		const y = band.start(i);
		const h = band.bandWidth;
		const max = row.max ?? chartMax;
		const w = row.value === null ? 0 : (Math.max(0, Math.min(row.value, max)) / max) * plot.w;
		const x = rtl ? plot.x + plot.w - w : plot.x;
		const cls = row.value === null ? slotClass('bar', 'muted') : slotClass('bar', row.slot ?? 1);
		primitives.push({
			type: 'path',
			cls,
			d: roundedRectPath(x, y, w, h, BAR_RX, { tl: rtl, bl: rtl, tr: !rtl, br: !rtl }),
			hit: i,
			box: { x, y, w, h },
		});
		primitives.push({
			type: 'text',
			cls: 'chart__label',
			x: rtl ? plot.x + plot.w + LABEL_GAP : plot.x - LABEL_GAP,
			y: y + h / 2,
			text: row.label,
			anchor: rtl ? 'start' : 'end',
			baseline: 'middle',
		});
		const valueText = row.value === null ? row.note ?? '' : formatValue(row.value, spec.unit, ctx.locale);
		primitives.push({
			type: 'text',
			cls: row.value === null ? 'chart__note' : 'chart__tick',
			x: rtl ? x - TICK_GAP : x + w + TICK_GAP,
			y: y + h / 2,
			text: valueText,
			anchor: rtl ? 'end' : 'start',
			baseline: 'middle',
		});
		hits.push({
			index: i,
			x: plot.x,
			y,
			w: plot.w,
			h,
			label: row.label,
			lines: [{ label: row.label, value: valueText, slot: row.value === null ? 'muted' : row.slot ?? 1 }],
		});
	});

	const table = {
		head: ['', ''],
		rows: spec.rows.map((r) => [r.label, r.value === null ? r.note ?? '' : formatValue(r.value, spec.unit, ctx.locale)]),
	};

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot,
		primitives,
		hits,
		legend: [],
		a11y: { desc: describeChart(spec, table), table },
	};
}

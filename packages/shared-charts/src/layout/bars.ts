import { formatBucketKey } from '../format';
import { roundedRectPath } from '../paths';
import { bandScale } from '../scales';
import type { ChartGeometry, ChartSpec, Hit, LayoutContext, Primitive } from '../types';
import { resolveYAxis, xLabelPrimitives, yAxisPrimitives } from './axes';
import { BAR_GAP, BAR_RX, slotClass } from './frame';
import { formatValue } from './line';
import { describeChart } from '../a11y';

type BarsSpec = Extract<ChartSpec, { kind: 'bars' }>;
type StackedSpec = Extract<ChartSpec, { kind: 'stackedBars' }>;

interface Column {
	label: string;
	/** Bottom-up segments: [value, slot, seriesLabel] */
	segments: Array<{ value: number; slot: 1 | 2 | 3 | 4 | 5 | 6; label: string }>;
}

function layoutColumns(
	spec: BarsSpec | StackedSpec,
	columns: Column[],
	yMax: number | undefined,
	unit: string | undefined,
	ctx: LayoutContext,
): ChartGeometry {
	const totals = columns.map((c) => c.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0));
	const axis = resolveYAxis(totals, ctx, { yMax, from: 'zero' });
	const primitives: Primitive[] = yAxisPrimitives(axis, ctx);
	const band = bandScale(columns.length, [ctx.plot.x, ctx.plot.x + ctx.plot.w], BAR_GAP);

	columns.forEach((col, i) => {
		let cumulative = 0;
		const drawn = col.segments.filter((s) => s.value > 0);
		drawn.forEach((seg, j) => {
			const y0 = axis.scale(cumulative);
			cumulative += seg.value;
			const y1 = axis.scale(cumulative);
			const isTop = j === drawn.length - 1;
			// Segments above the first sit BAR_GAP higher so neighbours never touch.
			const gapBelow = j === 0 ? 0 : BAR_GAP;
			const h = Math.max(0, y0 - y1 - gapBelow);
			const y = y1;
			const x = band.start(i);
			primitives.push({
				type: 'path',
				cls: slotClass('bar', seg.slot),
				d: roundedRectPath(x, y, band.bandWidth, h, isTop ? BAR_RX : 0, { tl: isTop, tr: isTop, br: false, bl: false }),
				hit: i,
				box: { x, y, w: band.bandWidth, h },
			});
		});
	});

	const labels = columns.map((c) => c.label);
	primitives.push(...xLabelPrimitives(labels, (i) => band.center(i), ctx));

	const hits: Hit[] = columns.map((col, i) => ({
		index: i,
		x: band.start(i),
		y: ctx.plot.y,
		w: band.bandWidth,
		h: ctx.plot.h,
		label: col.label,
		lines: col.segments.map((s) => ({ label: s.label, value: formatValue(s.value, unit, ctx.locale), slot: s.slot })),
	}));

	const seriesLabels = columns[0]?.segments.map((s) => s.label) ?? spec.series.map((s) => s.label);
	const table = {
		head: ['', ...seriesLabels],
		rows: columns.map((c) => [c.label, ...c.segments.map((s) => formatValue(s.value, unit, ctx.locale))]),
	};
	const legend = spec.series.map((s) => ({ label: s.label, slot: s.slot }));

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot: ctx.plot,
		primitives,
		hits,
		legend: spec.kind === 'stackedBars' ? legend : [],
		a11y: { desc: describeChart(spec, table), table },
	};
}

export function layoutBars(spec: BarsSpec, ctx: LayoutContext): ChartGeometry {
	const [series] = spec.series;
	const columns: Column[] = spec.keys.map((key, i) => ({
		label: formatBucketKey(key, spec.granularity, ctx.locale),
		segments: [{ value: series.values[i] ?? 0, slot: series.slot, label: series.label }],
	}));

	return layoutColumns(spec, columns, spec.yMax, spec.unit, ctx);
}

const PERCENT = 100;

export function layoutStackedBars(spec: StackedSpec, ctx: LayoutContext): ChartGeometry {
	const columns: Column[] = spec.categories.map((label, i) => {
		const raw = spec.series.map((s) => ({ value: Math.max(0, s.values[i] ?? 0), slot: s.slot, label: s.label }));
		if (!spec.normalize) return { label, segments: raw };
		const total = raw.reduce((sum, s) => sum + s.value, 0);

		return {
			label,
			segments: raw.map((s) => ({ ...s, value: total > 0 ? (s.value / total) * PERCENT : 0 })),
		};
	});

	return layoutColumns(spec, columns, spec.normalize ? PERCENT : undefined, spec.normalize ? '%' : spec.unit, ctx);
}

import { formatNumber } from '../format';
import { binValues } from '../histogram';
import { roundedTopRectPath } from '../paths';
import { bandScale, linearScale } from '../scales';
import type { ChartGeometry, ChartSpec, Hit, LayoutContext, Primitive } from '../types';
import { resolveYAxis, xLabelPrimitives, yAxisPrimitives } from './axes';
import { BAR_GAP, BAR_RX } from './frame';
import { describeChart } from '../a11y';

type HistogramSpec = Extract<ChartSpec, { kind: 'histogram' }>;

const DEFAULT_BINS = 6;
const MARKER_LABEL_GAP = 4;
const MARKER_LABEL_Y = 10;

export function layoutHistogram(spec: HistogramSpec, ctx: LayoutContext): ChartGeometry {
	const binned = binValues(spec.values, spec.binCount ?? DEFAULT_BINS);
	const counts = binned.bins.map((b) => b.count);
	const axis = resolveYAxis(counts, ctx, { from: 'zero' });
	const primitives: Primitive[] = yAxisPrimitives(axis, ctx);
	const band = bandScale(binned.bins.length, [ctx.plot.x, ctx.plot.x + ctx.plot.w], BAR_GAP);
	const baseY = ctx.plot.y + ctx.plot.h;

	binned.bins.forEach((bin, i) => {
		const y = axis.scale(bin.count);
		const h = baseY - y;
		const x = band.start(i);
		primitives.push({
			type: 'path',
			cls: 'chart__bin',
			d: roundedTopRectPath(x, y, band.bandWidth, h, BAR_RX),
			hit: i,
			box: { x, y, w: band.bandWidth, h },
		});
	});

	const labels = binned.bins.map((b) => formatNumber(b.start, ctx.locale, 0));
	primitives.push(...xLabelPrimitives(labels, (i) => band.center(i), ctx));

	if (spec.highlightValue !== undefined && binned.bins.length > 0 && Number.isFinite(spec.highlightValue)) {
		const xScale = linearScale([binned.min, binned.max], [ctx.plot.x, ctx.plot.x + ctx.plot.w]);
		const x = Math.min(ctx.plot.x + ctx.plot.w, Math.max(ctx.plot.x, xScale(spec.highlightValue)));
		primitives.push({ type: 'line', cls: 'chart__marker', x1: x, y1: ctx.plot.y, x2: x, y2: baseY, dashed: true });
		if (spec.highlightLabel) {
			const rtl = ctx.dir === 'rtl';
			primitives.push({
				type: 'text',
				cls: 'chart__label',
				x: rtl ? x - MARKER_LABEL_GAP : x + MARKER_LABEL_GAP,
				y: ctx.plot.y + MARKER_LABEL_Y,
				text: `${spec.highlightLabel} ${formatNumber(spec.highlightValue, ctx.locale)}`,
				anchor: rtl ? 'end' : 'start',
				baseline: 'middle',
			});
		}
	}

	const rangeLabel = (i: number): string =>
		`${formatNumber(binned.bins[i].start, ctx.locale)}–${formatNumber(binned.bins[i].end, ctx.locale)}`;
	const hits: Hit[] = binned.bins.map((bin, i) => ({
		index: i,
		x: band.start(i),
		y: ctx.plot.y,
		w: band.bandWidth,
		h: ctx.plot.h,
		label: rangeLabel(i),
		lines: [{ label: rangeLabel(i), value: formatNumber(bin.count, ctx.locale) }],
	}));
	const table = {
		head: ['', ''],
		rows: binned.bins.map((bin, i) => [rangeLabel(i), formatNumber(bin.count, ctx.locale)]),
	};

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot: ctx.plot,
		primitives,
		hits,
		legend: [],
		a11y: { desc: describeChart(spec, table), table },
	};
}

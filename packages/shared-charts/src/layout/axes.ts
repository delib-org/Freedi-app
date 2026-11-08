import { formatNumber } from '../format';
import { linearScale, type LinearScale } from '../scales';
import { niceTicks, thinLabels } from '../ticks';
import type { LayoutContext, Primitive } from '../types';
import { TICK_COUNT, TICK_GAP } from './frame';

export interface YAxis {
	domain: [number, number];
	ticks: number[];
	scale: LinearScale;
}

export interface YDomainOptions {
	yMax?: number;
	from?: 'zero' | 'data';
}

/**
 * Nice ticks + a value→pixel scale for the vertical axis. Bars, histograms
 * and (by default) lines start at zero; `from: 'data'` lets a line chart
 * zoom into its own range.
 */
export function resolveYAxis(values: number[], ctx: LayoutContext, opts: YDomainOptions = {}): YAxis {
	const finite = values.filter((v) => Number.isFinite(v));
	const dataMin = finite.length ? Math.min(...finite) : 0;
	const dataMax = finite.length ? Math.max(...finite) : 0;
	const lo = opts.from === 'data' ? Math.min(dataMin, dataMax) : Math.min(0, dataMin);
	const hi = opts.yMax ?? Math.max(dataMax, lo);
	let ticks = niceTicks(lo, hi, TICK_COUNT);
	if (opts.yMax !== undefined) {
		ticks = ticks.filter((t) => t <= opts.yMax!);
		if (ticks[ticks.length - 1] !== opts.yMax) ticks.push(opts.yMax);
	}
	const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
	const scale = linearScale(domain, [ctx.plot.y + ctx.plot.h, ctx.plot.y]);

	return { domain, ticks, scale };
}

/** Horizontal grid lines plus one tick label per tick, on the reading-start side. */
export function yAxisPrimitives(axis: YAxis, ctx: LayoutContext): Primitive[] {
	const { plot, dir } = ctx;
	const out: Primitive[] = [];
	for (const t of axis.ticks) {
		const y = axis.scale(t);
		out.push({ type: 'line', cls: 'chart__grid', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y });
		out.push({
			type: 'text',
			cls: 'chart__tick',
			x: dir === 'rtl' ? plot.x + plot.w + TICK_GAP : plot.x - TICK_GAP,
			y,
			text: formatNumber(t, ctx.locale),
			anchor: dir === 'rtl' ? 'start' : 'end',
			baseline: 'middle',
		});
	}

	return out;
}

const X_LABEL_OFFSET = 14;

/** Category labels under the plot, thinned to `ctx.maxXLabels`. */
export function xLabelPrimitives(labels: string[], centerX: (i: number) => number, ctx: LayoutContext): Primitive[] {
	const kept = thinLabels(labels, ctx.maxXLabels);

	return kept.map((i) => ({
		type: 'text',
		cls: 'chart__label',
		x: centerX(i),
		y: ctx.plot.y + ctx.plot.h + X_LABEL_OFFSET,
		text: labels[i],
		anchor: 'middle',
		baseline: 'auto',
	}));
}

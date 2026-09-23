import { formatBucketKey, formatNumber } from '../format';
import { areaPath, linePath, type Point } from '../paths';
import type { ChartGeometry, ChartSpec, Hit, LayoutContext, Primitive } from '../types';
import { resolveYAxis, xLabelPrimitives, yAxisPrimitives } from './axes';
import { DOT_R, slotClass } from './frame';
import { describeChart } from '../a11y';

type LineSpec = Extract<ChartSpec, { kind: 'line' }>;
type SparkSpec = Extract<ChartSpec, { kind: 'sparkline' }>;

/** x of point `i` when `n` points span the plot; a single point sits in the middle. */
export function pointX(i: number, n: number, ctx: LayoutContext): number {
	if (n <= 1) return ctx.plot.x + ctx.plot.w / 2;

	return ctx.plot.x + (i / (n - 1)) * ctx.plot.w;
}

/** Hit column boundaries for point `i` — halfway to each neighbour. */
export function pointHitBox(i: number, n: number, ctx: LayoutContext): { x: number; w: number } {
	const { plot } = ctx;
	if (n <= 1) return { x: plot.x, w: plot.w };
	const left = i === 0 ? plot.x : (pointX(i - 1, n, ctx) + pointX(i, n, ctx)) / 2;
	const right = i === n - 1 ? plot.x + plot.w : (pointX(i, n, ctx) + pointX(i + 1, n, ctx)) / 2;

	return { x: left, w: right - left };
}

export function layoutLine(spec: LineSpec, ctx: LayoutContext): ChartGeometry {
	const n = spec.keys.length;
	const all = spec.series.flatMap((s) => s.values.slice(0, n));
	const axis = resolveYAxis(all, ctx, { yMax: spec.yMax, from: spec.yDomainFrom ?? 'zero' });
	const primitives: Primitive[] = yAxisPrimitives(axis, ctx);
	const showDots = spec.showDots ?? true;
	const baseY = ctx.plot.y + ctx.plot.h;

	for (const s of spec.series) {
		const points: Point[] = [];
		for (let i = 0; i < n; i++) {
			const v = s.values[i];
			if (!Number.isFinite(v)) continue;
			points.push({ x: pointX(i, n, ctx), y: axis.scale(v) });
		}
		if (spec.series.length === 1 && points.length > 1) {
			primitives.push({ type: 'path', cls: slotClass('area', s.slot), d: areaPath(points, baseY) });
		}
		if (points.length > 1) {
			primitives.push({ type: 'path', cls: slotClass('line', s.slot), d: linePath(points) });
		}
		if (showDots || points.length === 1) {
			for (let i = 0; i < n; i++) {
				const v = s.values[i];
				if (!Number.isFinite(v)) continue;
				primitives.push({
					type: 'circle',
					cls: slotClass('dot', s.slot),
					cx: pointX(i, n, ctx),
					cy: axis.scale(v),
					r: DOT_R,
					hit: i,
				});
			}
		}
	}

	const labels = spec.keys.map((k) => formatBucketKey(k, spec.granularity, ctx.locale));
	primitives.push(...xLabelPrimitives(labels, (i) => pointX(i, n, ctx), ctx));

	const hits: Hit[] = spec.keys.map((_, i) => {
		const box = pointHitBox(i, n, ctx);

		return {
			index: i,
			x: box.x,
			y: ctx.plot.y,
			w: box.w,
			h: ctx.plot.h,
			label: labels[i],
			lines: spec.series.map((s) => ({
				label: s.label,
				value: formatValue(s.values[i], spec.unit, ctx.locale),
				slot: s.slot,
			})),
		};
	});

	const table = {
		head: ['', ...spec.series.map((s) => s.label)],
		rows: spec.keys.map((_, i) => [labels[i], ...spec.series.map((s) => formatValue(s.values[i], spec.unit, ctx.locale))]),
	};

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot: ctx.plot,
		primitives,
		hits,
		legend: spec.series.map((s) => ({ label: s.label, slot: s.slot })),
		a11y: { desc: describeChart(spec, table), table },
	};
}

export function layoutSparkline(spec: SparkSpec, ctx: LayoutContext): ChartGeometry {
	const slot = spec.slot ?? 1;
	const n = spec.values.length;
	// A non-finite value is a gap, as in layoutLine: one NaN in the path's
	// `d` makes the browser drop the whole sparkline
	const axis = resolveYAxis(spec.values.filter(Number.isFinite), ctx, { from: 'zero' });
	const primitives: Primitive[] = [];
	if (spec.variant === 'bars') {
		const gap = 1;
		const w = n > 0 ? Math.max(0, (ctx.plot.w - gap * (n - 1)) / n) : 0;
		spec.values.forEach((v, i) => {
			if (!Number.isFinite(v)) return;
			const top = axis.scale(v);
			primitives.push({
				type: 'rect',
				cls: slotClass('bar', slot),
				x: ctx.plot.x + i * (w + gap),
				y: top,
				w,
				h: ctx.plot.y + ctx.plot.h - top,
				hit: i,
			});
		});
	} else {
		const points = spec.values.flatMap((v, i) =>
			Number.isFinite(v) ? [{ x: pointX(i, n, ctx), y: axis.scale(v) }] : [],
		);
		if (points.length > 1) {
			primitives.push({ type: 'path', cls: slotClass('area', slot), d: areaPath(points, ctx.plot.y + ctx.plot.h) });
			primitives.push({ type: 'path', cls: slotClass('line', slot), d: linePath(points) });
		}
	}
	const table = {
		head: ['', ''],
		rows: spec.keys.map((k, i) => [k, formatNumber(spec.values[i] ?? 0, ctx.locale)]),
	};

	return {
		viewBox: { w: ctx.width, h: ctx.height },
		plot: ctx.plot,
		primitives,
		hits: [],
		legend: [],
		a11y: { desc: describeChart(spec, table), table },
	};
}

export function formatValue(v: number | undefined, unit: string | undefined, locale: string): string {
	if (v === undefined || !Number.isFinite(v)) return '–';
	const num = formatNumber(v, locale);

	return unit ? `${num}${unit === '%' ? '' : ' '}${unit}` : num;
}

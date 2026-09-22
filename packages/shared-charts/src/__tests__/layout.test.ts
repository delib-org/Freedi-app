import { layoutChart } from '../layout';
import type { ChartGeometry, ChartSpec, PathPrimitive, TextPrimitive, CirclePrimitive, LinePrimitive } from '../types';

const paths = (g: ChartGeometry, cls: string): PathPrimitive[] =>
	g.primitives.filter((p): p is PathPrimitive => p.type === 'path' && p.cls === cls);
const texts = (g: ChartGeometry, cls: string): TextPrimitive[] =>
	g.primitives.filter((p): p is TextPrimitive => p.type === 'text' && p.cls === cls);

const twoBars: ChartSpec = {
	kind: 'bars',
	keys: ['2026-09-01', '2026-09-02'],
	granularity: 'day',
	series: [{ id: 'a', label: 'A', values: [10, 20], slot: 1 }],
};

describe('geometry carries no colour', () => {
	const specs: ChartSpec[] = [
		twoBars,
		{ kind: 'line', keys: ['2026-09-01', '2026-09-02', '2026-09-03'], granularity: 'day', series: [{ id: 'a', label: 'A', values: [1, 2, 3], slot: 2 }] },
		{ kind: 'strip', parts: [{ label: 'x', value: 1, slot: 1 }, { label: 'y', value: 3, slot: 'muted' }] },
		{ kind: 'hbars', rows: [{ label: 'r', value: 4 }, { label: 'n', value: null, note: 'no score yet' }] },
		{ kind: 'histogram', values: [1, 2, 3, 4, 9], highlightValue: 3, highlightLabel: 'median' },
		{ kind: 'sparkline', keys: ['a', 'b'], values: [1, 2] },
		{ kind: 'stackedBars', categories: ['c'], series: [{ id: 'a', label: 'A', values: [1], slot: 1 }] },
	];
	it.each(specs.map((s) => [s.kind, s] as const))('%s uses classes only', (_kind, spec) => {
		const json = JSON.stringify(layoutChart(spec));
		expect(json).not.toMatch(/#[0-9a-f]{3,6}\b/i);
		expect(json).not.toContain('var(');
		expect(json).not.toContain('rgb');
		for (const p of layoutChart(spec).primitives) expect(p.cls).toMatch(/^chart__/);
	});
});

describe('frame defaults', () => {
	it('is 600×220 for axis charts, 120×32 for sparklines, 600×28 for strips', () => {
		expect(layoutChart(twoBars).viewBox).toEqual({ w: 600, h: 220 });
		expect(layoutChart({ kind: 'sparkline', keys: [], values: [] }).viewBox).toEqual({ w: 120, h: 32 });
		expect(layoutChart({ kind: 'strip', parts: [] }).viewBox).toEqual({ w: 600, h: 28 });
	});

	it('grows hbars with the row count and honours overrides', () => {
		const three = layoutChart({ kind: 'hbars', rows: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }] });
		expect(three.viewBox.h).toBe(3 * 28 + 8);
		expect(layoutChart(twoBars, { width: 300, height: 100 }).viewBox).toEqual({ w: 300, h: 100 });
		expect(layoutChart(twoBars, { padding: { left: 0 } }).plot.x).toBe(0);
	});
});

describe('bars', () => {
	// plot height 150 = 184 − 10 top − 24 bottom
	const g = layoutChart(twoBars, { height: 184 });
	const bars = paths(g, 'chart__bar--s1');

	it('scales heights against nice ticks that end at the max', () => {
		expect(g.plot.h).toBe(150);
		expect(bars).toHaveLength(2);
		expect(bars[0].box?.h).toBe(75);
		expect(bars[1].box?.h).toBe(150);
		expect(bars[1].box?.y).toBe(g.plot.y);
	});

	it('leaves a 2-unit gap between adjacent bars and rounds only the top', () => {
		const [a, b] = bars;
		expect(a.box && b.box && b.box.x - (a.box.x + a.box.w)).toBe(2);
		expect(a.d.split('A').length - 1).toBe(2);
		expect(a.d.endsWith('Z')).toBe(true);
	});

	it('draws four nice y intervals as horizontal grid lines only', () => {
		const grid = g.primitives.filter((p): p is LinePrimitive => p.type === 'line' && p.cls === 'chart__grid');
		expect(grid).toHaveLength(5);
		for (const l of grid) expect(l.y1).toBe(l.y2);
		expect(texts(g, 'chart__tick').map((t) => t.text)).toEqual(['0', '5', '10', '15', '20']);
	});

	it('puts tick labels at the left edge, anchored end, in LTR', () => {
		const tick = texts(g, 'chart__tick')[0];
		expect(tick.anchor).toBe('end');
		expect(tick.x).toBe(g.plot.x - 6);
	});

	it('exposes one hit per bucket with formatted lines and an a11y table', () => {
		expect(g.hits).toHaveLength(2);
		expect(g.hits[1]).toMatchObject({ index: 1, label: '2/9', lines: [{ label: 'A', value: '20', slot: 1 }] });
		expect(g.hits[1].h).toBe(g.plot.h);
		expect(g.a11y.table).toEqual({ head: ['', 'A'], rows: [['1/9', '10'], ['2/9', '20']] });
		expect(g.a11y.desc).toContain('bar chart');
		expect(g.legend).toEqual([]);
	});

	it('honours yMax and prints units', () => {
		const pct = layoutChart({ ...twoBars, yMax: 100, unit: '%' });
		expect(texts(pct, 'chart__tick').map((t) => t.text)).toEqual(['0', '25', '50', '75', '100']);
		expect(pct.hits[0].lines[0].value).toBe('10%');
		const min = layoutChart({ ...twoBars, unit: 'min' });
		expect(min.hits[0].lines[0].value).toBe('10 min');
	});

	it('thins x labels to maxXLabels, keeping the first and last', () => {
		const keys = Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
		const g20 = layoutChart({ kind: 'bars', keys, granularity: 'day', series: [{ id: 'a', label: 'A', values: keys.map(() => 1), slot: 1 }] });
		const labels = texts(g20, 'chart__label').map((t) => t.text);
		expect(labels).toHaveLength(6);
		expect(labels[0]).toBe('1/9');
		expect(labels[5]).toBe('20/9');
		expect(texts(layoutChart(twoBars, { maxXLabels: 0 }), 'chart__label')).toHaveLength(0);
	});

	it('draws nothing for a zero value but still lists it', () => {
		const z = layoutChart({ ...twoBars, series: [{ id: 'a', label: 'A', values: [0, 5], slot: 1 }] });
		expect(paths(z, 'chart__bar--s1')).toHaveLength(1);
		expect(z.hits[0].lines[0].value).toBe('0');
	});
});

describe('stackedBars', () => {
	const spec: ChartSpec = {
		kind: 'stackedBars',
		categories: ['Ada', 'Bo'],
		series: [
			{ id: 'p', label: 'P', values: [10, 0], slot: 1 },
			{ id: 'h', label: 'H', values: [10, 5], slot: 2 },
		],
	};
	const g = layoutChart(spec, { height: 184 });

	it('stacks the first series at the bottom and rounds only the top segment', () => {
		const p = paths(g, 'chart__bar--s1')[0];
		const h = paths(g, 'chart__bar--s2')[0];
		expect(p.box && h.box && p.box.y > h.box.y).toBe(true);
		expect(p.d).not.toContain('A');
		expect(h.d.split('A').length - 1).toBe(2);
		expect(p.box && h.box && p.box.y - (h.box.y + h.box.h)).toBe(2);
	});

	it('skips empty segments and still rounds the top one', () => {
		const bo = paths(g, 'chart__bar--s2')[1];
		expect(paths(g, 'chart__bar--s1')).toHaveLength(1);
		expect(bo.d.split('A').length - 1).toBe(2);
	});

	it('carries a legend, per-series hit lines and a table', () => {
		expect(g.legend).toEqual([{ label: 'P', slot: 1 }, { label: 'H', slot: 2 }]);
		expect(g.hits[0].lines).toHaveLength(2);
		expect(g.a11y.table.head).toEqual(['', 'P', 'H']);
		expect(g.a11y.table.rows[1]).toEqual(['Bo', '0', '5']);
	});

	it('normalizes to percent when asked', () => {
		const n = layoutChart({ ...spec, normalize: true });
		expect(texts(n, 'chart__tick').map((t) => t.text)).toEqual(['0', '25', '50', '75', '100']);
		expect(n.hits[0].lines[0].value).toBe('50%');
		expect(n.hits[1].lines[1].value).toBe('100%');
		const empty = layoutChart({ kind: 'stackedBars', categories: ['z'], series: [{ id: 'a', label: 'A', values: [0], slot: 1 }], normalize: true });
		expect(empty.hits[0].lines[0].value).toBe('0%');
	});
});

describe('line', () => {
	const spec: ChartSpec = {
		kind: 'line',
		keys: ['2026-09-01', '2026-09-02', '2026-09-03'],
		granularity: 'day',
		series: [{ id: 'a', label: 'A', values: [40, 50, 60], slot: 3 }],
	};

	it('starts the y axis at zero by default and at the data on request', () => {
		expect(texts(layoutChart(spec), 'chart__tick')[0].text).toBe('0');
		expect(texts(layoutChart({ ...spec, yDomainFrom: 'data' }), 'chart__tick')[0].text).toBe('40');
	});

	it('draws an area, a line and r=4 dots for a single series', () => {
		const g = layoutChart(spec);
		expect(paths(g, 'chart__area--s3')).toHaveLength(1);
		expect(paths(g, 'chart__line--s3')).toHaveLength(1);
		const dots = g.primitives.filter((p): p is CirclePrimitive => p.type === 'circle');
		expect(dots).toHaveLength(3);
		expect(dots[0]).toMatchObject({ cls: 'chart__dot--s3', r: 4, hit: 0 });
		expect(dots[0].cx).toBe(g.plot.x);
		expect(dots[2].cx).toBe(g.plot.x + g.plot.w);
	});

	it('skips the area for multiple series and dots when asked', () => {
		const two = layoutChart({ ...spec, showDots: false, series: [...spec.series, { id: 'b', label: 'B', values: [1, 2, 3], slot: 4 }] });
		expect(two.primitives.some((p) => p.cls.startsWith('chart__area'))).toBe(false);
		expect(two.primitives.some((p) => p.type === 'circle')).toBe(false);
		expect(two.legend).toHaveLength(2);
		expect(two.hits[0].lines).toHaveLength(2);
	});

	it('hit columns split halfway between neighbours and cover the plot', () => {
		const g = layoutChart(spec);
		expect(g.hits[0].x).toBe(g.plot.x);
		expect(g.hits[0].x + g.hits[0].w).toBe(g.hits[1].x);
		expect(g.hits[2].x + g.hits[2].w).toBe(g.plot.x + g.plot.w);
	});

	it('skips non-finite values and centres a lone point', () => {
		const one = layoutChart({ ...spec, keys: ['2026-09-01'], series: [{ id: 'a', label: 'A', values: [3], slot: 1 }] });
		const dot = one.primitives.find((p): p is CirclePrimitive => p.type === 'circle');
		expect(dot?.cx).toBe(one.plot.x + one.plot.w / 2);
		expect(one.hits[0].w).toBe(one.plot.w);
		const gap = layoutChart({ ...spec, series: [{ id: 'a', label: 'A', values: [1, Number.NaN, 3], slot: 1 }] });
		expect(gap.primitives.filter((p) => p.type === 'circle')).toHaveLength(2);
		expect(gap.hits[1].lines[0].value).toBe('–');
	});
});

describe('sparkline', () => {
	it('draws a line without axes, labels or hits', () => {
		const g = layoutChart({ kind: 'sparkline', keys: ['a', 'b', 'c'], values: [1, 3, 2] });
		expect(g.primitives.some((p) => p.type === 'text')).toBe(false);
		expect(g.primitives.some((p) => p.cls === 'chart__grid')).toBe(false);
		expect(paths(g, 'chart__line--s1')).toHaveLength(1);
		expect(g.hits).toEqual([]);
		expect(g.a11y.table.rows).toHaveLength(3);
	});

	it('draws bars on request with the chosen slot', () => {
		const g = layoutChart({ kind: 'sparkline', keys: ['a', 'b'], values: [1, 2], slot: 5, variant: 'bars' });
		const rects = g.primitives.filter((p) => p.type === 'rect');
		expect(rects).toHaveLength(2);
		expect(rects[0].cls).toBe('chart__bar--s5');
	});

	it('copes with no values', () => {
		expect(layoutChart({ kind: 'sparkline', keys: [], values: [] }).primitives).toEqual([]);
		expect(layoutChart({ kind: 'sparkline', keys: [], values: [], variant: 'bars' }).primitives).toEqual([]);
	});
});

describe('hbars', () => {
	const spec: ChartSpec = {
		kind: 'hbars',
		rows: [
			{ label: 'Class A', value: 80, slot: 2 },
			{ label: 'Class B', value: 40, max: 100 },
			{ label: 'Class C', value: null, note: 'no score yet' },
		],
	};
	const g = layoutChart(spec);

	it('scales bars against the largest value or a row max', () => {
		const a = paths(g, 'chart__bar--s2')[0];
		const b = paths(g, 'chart__bar--s1')[0];
		expect(a.box?.w).toBe(g.plot.w);
		expect(b.box?.w).toBe(g.plot.w * 0.4);
		expect(a.box?.x).toBe(g.plot.x);
		expect(a.d.split('A').length - 1).toBe(2);
	});

	it('renders a null row as a zero-width muted bar with its note', () => {
		const c = paths(g, 'chart__bar--muted')[0];
		expect(c.box?.w).toBe(0);
		expect(texts(g, 'chart__note').map((t) => t.text)).toEqual(['no score yet']);
		expect(g.hits[2].lines[0]).toEqual({ label: 'Class C', value: 'no score yet', slot: 'muted' });
		expect(g.a11y.table.rows[2]).toEqual(['Class C', 'no score yet']);
	});

	it('labels rows on the start side and values at the bar end', () => {
		const labels = texts(g, 'chart__label');
		expect(labels[0]).toMatchObject({ text: 'Class A', anchor: 'end', x: g.plot.x - 8 });
		const value = texts(g, 'chart__tick')[0];
		expect(value.anchor).toBe('start');
		expect(value.x).toBe(g.plot.x + g.plot.w + 6);
	});

	it('grows from the right in RTL', () => {
		const r = layoutChart(spec, { dir: 'rtl' });
		const a = paths(r, 'chart__bar--s2')[0];
		expect(a.box && a.box.x + a.box.w).toBe(r.plot.x + r.plot.w);
		const b = paths(r, 'chart__bar--s1')[0];
		expect(b.box && b.box.x + b.box.w).toBe(r.plot.x + r.plot.w);
		expect(texts(r, 'chart__label')[0].anchor).toBe('start');
		expect(r.plot.x).toBe(56);
	});

	it('copes with no rows', () => {
		const e = layoutChart({ kind: 'hbars', rows: [] });
		expect(e.primitives).toEqual([]);
		expect(e.viewBox.h).toBe(36);
	});
});

describe('strip', () => {
	const spec: ChartSpec = {
		kind: 'strip',
		parts: [
			{ label: 'yes', value: 3, slot: 4, icon: '✓' },
			{ label: 'no', value: 1, slot: 5 },
			{ label: 'none', value: 0, slot: 'muted' },
		],
	};
	const g = layoutChart(spec);

	it('splits the plot width proportionally and sums to it exactly', () => {
		const parts = g.primitives.filter((p): p is PathPrimitive => p.type === 'path');
		expect(parts).toHaveLength(2);
		expect(parts[0].box?.w).toBe(g.plot.w * 0.75);
		expect(parts.reduce((s, p) => s + (p.box?.w ?? 0), 0)).toBe(g.plot.w);
		expect(parts[0].box?.x).toBe(g.plot.x);
		expect(parts[1].box && parts[1].box.x + parts[1].box.w).toBe(g.plot.x + g.plot.w);
	});

	it('rounds the outer ends only', () => {
		const parts = paths(g, 'chart__strip-part--s4').concat(paths(g, 'chart__strip-part--s5'));
		expect(parts[0].d.split('A').length - 1).toBe(2);
		expect(parts[1].d.split('A').length - 1).toBe(2);
	});

	it('lists every part in the legend and the table, with icons', () => {
		expect(g.legend).toEqual([
			{ label: 'yes', slot: 4, icon: '✓' },
			{ label: 'no', slot: 5, icon: undefined },
			{ label: 'none', slot: 'muted', icon: undefined },
		]);
		expect(g.hits).toHaveLength(2);
		expect(g.hits[0].lines[0].value).toBe('3 (75%)');
		expect(g.a11y.table.rows).toHaveLength(3);
	});

	it('grows from the right in RTL', () => {
		const r = layoutChart(spec, { dir: 'rtl' });
		const first = paths(r, 'chart__strip-part--s4')[0];
		expect(first.box && first.box.x + first.box.w).toBe(r.plot.x + r.plot.w);
	});

	it('draws one muted bar when everything is zero', () => {
		const z = layoutChart({ kind: 'strip', parts: [{ label: 'a', value: 0, slot: 1 }] });
		expect(z.primitives).toHaveLength(1);
		expect(z.primitives[0].cls).toBe('chart__strip-part--muted');
		expect(z.hits).toEqual([]);
	});
});

describe('histogram', () => {
	const spec: ChartSpec = { kind: 'histogram', values: [1, 2, 2, 3, 3, 3, 4, 10], binCount: 3, highlightValue: 3, highlightLabel: 'median' };
	const g = layoutChart(spec);

	it('draws one bin per bucket with the bin class and rounded tops', () => {
		const bins = paths(g, 'chart__bin');
		expect(bins).toHaveLength(3);
		expect(bins[0].d.split('A').length - 1).toBe(2);
		expect(g.hits[0].label).toBe('1–4');
		expect(g.a11y.table.rows[0]).toEqual(['1–4', '6']);
	});

	it('marks the highlight with a dashed vertical line and a label', () => {
		const marker = g.primitives.find((p): p is LinePrimitive => p.cls === 'chart__marker');
		expect(marker?.dashed).toBe(true);
		expect(marker?.x1).toBe(marker?.x2);
		expect(marker?.x1).toBe(g.plot.x + ((3 - 1) / 9) * g.plot.w);
		expect(texts(g, 'chart__label').some((t) => t.text === 'median 3' && t.anchor === 'start')).toBe(true);
		const rtl = layoutChart(spec, { dir: 'rtl' });
		expect(texts(rtl, 'chart__label').some((t) => t.text === 'median 3' && t.anchor === 'end')).toBe(true);
	});

	it('clamps a highlight outside the range and skips it without data', () => {
		const out = layoutChart({ ...spec, highlightValue: 99, highlightLabel: undefined });
		const marker = out.primitives.find((p): p is LinePrimitive => p.cls === 'chart__marker');
		expect(marker?.x1).toBe(out.plot.x + out.plot.w);
		expect(texts(out, 'chart__label').some((t) => t.text.startsWith('median'))).toBe(false);
		const empty = layoutChart({ kind: 'histogram', values: [], highlightValue: 1 });
		expect(empty.primitives.some((p) => p.cls === 'chart__marker')).toBe(false);
		expect(empty.hits).toEqual([]);
	});

	it('defaults to six bins', () => {
		expect(paths(layoutChart({ kind: 'histogram', values: [0, 6] }), 'chart__bin')).toHaveLength(6);
	});
});

describe('RTL axis charts', () => {
	it('moves the tick column to the right edge, anchored start, and keeps time left→right', () => {
		const r = layoutChart(twoBars, { dir: 'rtl' });
		const tick = texts(r, 'chart__tick')[0];
		expect(tick.anchor).toBe('start');
		expect(tick.x).toBe(r.plot.x + r.plot.w + 6);
		expect(r.plot.x).toBe(16);
		const bars = paths(r, 'chart__bar--s1');
		expect(bars[0].box && bars[1].box && bars[0].box.x < bars[1].box.x).toBe(true);
		const line = layoutChart({ kind: 'line', keys: twoBars.keys, granularity: 'day', series: twoBars.series }, { dir: 'rtl' });
		const dots = line.primitives.filter((p): p is CirclePrimitive => p.type === 'circle');
		expect(dots[0].cx < dots[1].cx).toBe(true);
	});
});

describe('locale', () => {
	it('formats keys and numbers in the requested locale', () => {
		const he = layoutChart({ ...twoBars, series: [{ id: 'a', label: 'A', values: [1000, 2000], slot: 1 }] }, { locale: 'he' });
		expect(texts(he, 'chart__label')[0].text).toBe('1.9');
		expect(he.hits[0].lines[0].value).toBe('1,000');
	});
});

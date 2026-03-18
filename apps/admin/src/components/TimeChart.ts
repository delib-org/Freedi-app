import m from 'mithril';
import type { DayBucket } from '../lib/queries';

// ── Single-series area/bar chart ─────────────────────────────────────

export interface TimeChartAttrs {
	title: string;
	data: DayBucket[];
	color: string;
	variant?: 'bar' | 'area';
	height?: number;
}

const VB_W = 600;
const PAD_LEFT = 50;
const PAD_RIGHT = 16;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;
const FONT_Y = 10;
const FONT_X = 9;
const STROKE_GRID = 1;
const STROKE_LINE = 2.5;
const DOT_R = 3;
const BAR_RX = 2;

function formatDateLabel(iso: string): string {
	const d = new Date(iso + 'T00:00:00');
	return `${d.getDate()}/${d.getMonth() + 1}`;
}

export const TimeChart: m.Component<TimeChartAttrs> = {
	view(vnode) {
		const { title, data, color, variant = 'area', height = 180 } = vnode.attrs;

		if (data.length === 0) {
			return m('.chart-card', [
				m('.chart-card__title', title),
				m('.chart-card__empty', 'No data'),
			]);
		}

		const maxVal = Math.max(...data.map((d) => d.count), 1);
		const plotW = VB_W - PAD_LEFT - PAD_RIGHT;
		const plotH = height - PAD_TOP - PAD_BOTTOM;
		const barW = data.length > 1 ? plotW / data.length : plotW;
		const total = data.reduce((s, d) => s + d.count, 0);

		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
			y: PAD_TOP + plotH * (1 - pct),
			label: Math.round(maxVal * pct).toString(),
		}));

		const labelStep = Math.max(1, Math.floor(data.length / 6));
		const xLabels = data
			.map((d, i) => ({ i, label: formatDateLabel(d.date) }))
			.filter((_, i) => i % labelStep === 0 || i === data.length - 1);

		const svgChildren: m.Children[] = [];

		// Y grid lines
		for (const t of yTicks) {
			svgChildren.push(
				m('line', {
					x1: PAD_LEFT, y1: t.y,
					x2: VB_W - PAD_RIGHT, y2: t.y,
					stroke: 'var(--border-color)', 'stroke-width': STROKE_GRID,
				})
			);
		}

		// Y labels
		for (const t of yTicks) {
			svgChildren.push(
				m('text', {
					x: PAD_LEFT - 6, y: t.y + FONT_Y * 0.35,
					'text-anchor': 'end',
					fill: 'var(--text-muted)', 'font-size': FONT_Y,
					'font-family': 'var(--font-family)',
				}, t.label)
			);
		}

		// Data
		if (variant === 'bar') {
			for (let i = 0; i < data.length; i++) {
				const d = data[i];
				const barH = (d.count / maxVal) * plotH;
				const x = PAD_LEFT + i * barW + barW * 0.15;
				const bw = barW * 0.7;
				svgChildren.push(
					m('rect', {
						x, y: PAD_TOP + plotH - barH,
						width: Math.max(bw, 1), height: barH,
						fill: color, rx: BAR_RX, opacity: 0.85,
					})
				);
			}
		} else {
			svgChildren.push(
				m('path', {
					d: areaPath(data, maxVal, plotW, plotH, PAD_LEFT, PAD_TOP),
					fill: color, opacity: 0.15,
				})
			);
			svgChildren.push(
				m('polyline', {
					points: data
						.map((d, i) => {
							const x = PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
							const y = PAD_TOP + plotH - (d.count / maxVal) * plotH;
							return `${x},${y}`;
						})
						.join(' '),
					fill: 'none', stroke: color,
					'stroke-width': STROKE_LINE, 'stroke-linejoin': 'round',
				})
			);
			for (let i = 0; i < data.length; i++) {
				const d = data[i];
				if (d.count > 0) {
					const x = PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
					const y = PAD_TOP + plotH - (d.count / maxVal) * plotH;
					svgChildren.push(
						m('circle', { cx: x, cy: y, r: DOT_R, fill: color })
					);
				}
			}
		}

		// X labels
		for (const { i, label } of xLabels) {
			const x = variant === 'bar'
				? PAD_LEFT + i * barW + barW / 2
				: PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
			svgChildren.push(
				m('text', {
					x, y: height - 5,
					'text-anchor': 'middle',
					fill: 'var(--text-muted)', 'font-size': FONT_X,
					'font-family': 'var(--font-family)',
				}, label)
			);
		}

		return m('.chart-card', [
			m('.chart-card__header', [
				m('.chart-card__title', title),
				m('.chart-card__total', `Total: ${total.toLocaleString()}`),
			]),
			m('svg.chart-card__svg', {
				viewBox: `0 0 ${VB_W} ${height}`,
				style: { width: '100%', height: 'auto' },
			}, svgChildren),
		]);
	},
};

function areaPath(
	data: DayBucket[],
	maxVal: number,
	plotW: number,
	plotH: number,
	padL: number,
	padT: number,
): string {
	const n = Math.max(data.length - 1, 1);
	const points = data.map((d, i) => {
		const x = padL + (i / n) * plotW;
		const y = padT + plotH - (d.count / maxVal) * plotH;
		return `${x},${y}`;
	});
	const baseline = `${padL + plotW},${padT + plotH} ${padL},${padT + plotH}`;
	return `M${points.join(' L')} L${baseline} Z`;
}

// ── Multi-series stacked bar chart ───────────────────────────────────

export interface MultiSeriesItem {
	label: string;
	data: DayBucket[];
	color: string;
}

export interface MultiTimeChartAttrs {
	title: string;
	series: MultiSeriesItem[];
	height?: number;
}

export const MultiTimeChart: m.Component<MultiTimeChartAttrs> = {
	view(vnode) {
		const { title, series, height = 200 } = vnode.attrs;

		if (series.length === 0 || series.every((s) => s.data.length === 0)) {
			return m('.chart-card', [
				m('.chart-card__title', title),
				m('.chart-card__empty', 'No data'),
			]);
		}

		const dateSet = new Set<string>();
		for (const s of series) for (const d of s.data) dateSet.add(d.date);
		const dates = Array.from(dateSet).sort();

		const stacked = dates.map((date) => {
			let total = 0;
			const layers: Array<{ label: string; color: string; y0: number; y1: number }> = [];
			for (const s of series) {
				const bucket = s.data.find((d) => d.date === date);
				const val = bucket?.count || 0;
				layers.push({ label: s.label, color: s.color, y0: total, y1: total + val });
				total += val;
			}
			return { date, total, layers };
		});

		const maxVal = Math.max(...stacked.map((s) => s.total), 1);
		const plotW = VB_W - PAD_LEFT - PAD_RIGHT;
		const plotH = height - PAD_TOP - PAD_BOTTOM;

		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
			y: PAD_TOP + plotH * (1 - pct),
			label: Math.round(maxVal * pct).toString(),
		}));

		const labelStep = Math.max(1, Math.floor(dates.length / 6));

		const svgChildren: m.Children[] = [];

		for (const t of yTicks) {
			svgChildren.push(
				m('line', {
					x1: PAD_LEFT, y1: t.y,
					x2: VB_W - PAD_RIGHT, y2: t.y,
					stroke: 'var(--border-color)', 'stroke-width': STROKE_GRID,
				})
			);
		}
		for (const t of yTicks) {
			svgChildren.push(
				m('text', {
					x: PAD_LEFT - 6, y: t.y + FONT_Y * 0.35,
					'text-anchor': 'end',
					fill: 'var(--text-muted)', 'font-size': FONT_Y,
					'font-family': 'var(--font-family)',
				}, t.label)
			);
		}

		for (let i = 0; i < stacked.length; i++) {
			const col = stacked[i];
			const bw = plotW / dates.length;
			const x = PAD_LEFT + i * bw + bw * 0.1;
			const rectW = bw * 0.8;
			for (const layer of col.layers) {
				const h = ((layer.y1 - layer.y0) / maxVal) * plotH;
				if (h > 0) {
					const y = PAD_TOP + plotH - (layer.y1 / maxVal) * plotH;
					svgChildren.push(
						m('rect', {
							x, y,
							width: Math.max(rectW, 1),
							height: Math.max(h, 0.5),
							fill: layer.color, rx: BAR_RX,
						})
					);
				}
			}
		}

		for (let i = 0; i < dates.length; i++) {
			if (i % labelStep === 0 || i === dates.length - 1) {
				const bw = plotW / dates.length;
				const x = PAD_LEFT + i * bw + bw / 2;
				svgChildren.push(
					m('text', {
						x, y: height - 5,
						'text-anchor': 'middle',
						fill: 'var(--text-muted)', 'font-size': FONT_X,
						'font-family': 'var(--font-family)',
					}, formatDateLabel(dates[i]))
				);
			}
		}

		return m('.chart-card', [
			m('.chart-card__header', [
				m('.chart-card__title', title),
				m('.chart-card__legend',
					series.map((s) =>
						m('.chart-card__legend-item', [
							m('.chart-card__legend-dot', { style: { background: s.color } }),
							s.label,
						])
					)
				),
			]),
			m('svg.chart-card__svg', {
				viewBox: `0 0 ${VB_W} ${height}`,
				style: { width: '100%', height: 'auto' },
			}, svgChildren),
		]);
	},
};

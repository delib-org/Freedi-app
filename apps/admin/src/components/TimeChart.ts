import m from 'mithril';
import type { DayBucket } from '../lib/queries';

// ── Single-series area/bar chart ─────────────────────────────────────

export interface TimeChartAttrs {
	title: string;
	data: DayBucket[];
	color: string;
	/** 'bar' | 'area' (default: area) */
	variant?: 'bar' | 'area';
	height?: number;
}

const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;

function formatDateLabel(iso: string): string {
	const d = new Date(iso + 'T00:00:00');
	return `${d.getDate()}/${d.getMonth() + 1}`;
}

export const TimeChart: m.Component<TimeChartAttrs> = {
	view(vnode) {
		const { title, data, color, variant = 'area', height = 200 } = vnode.attrs;

		if (data.length === 0) {
			return m('.chart-card', [
				m('.chart-card__title', title),
				m('.chart-card__empty', 'No data'),
			]);
		}

		const maxVal = Math.max(...data.map((d) => d.count), 1);
		const w = 100; // viewBox percentage width
		const plotW = w - PAD_LEFT - PAD_RIGHT;
		const plotH = height - PAD_TOP - PAD_BOTTOM;
		const barW = data.length > 1 ? plotW / data.length : plotW;
		const total = data.reduce((s, d) => s + d.count, 0);

		// Y-axis grid lines (4 ticks)
		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
			y: PAD_TOP + plotH * (1 - pct),
			label: Math.round(maxVal * pct).toString(),
		}));

		// X-axis labels: show ~6 evenly spaced dates
		const labelStep = Math.max(1, Math.floor(data.length / 6));
		const xLabels = data
			.map((d, i) => ({ i, label: formatDateLabel(d.date) }))
			.filter((_, i) => i % labelStep === 0 || i === data.length - 1);

		return m('.chart-card', [
			m('.chart-card__header', [
				m('.chart-card__title', title),
				m('.chart-card__total', `Total: ${total.toLocaleString()}`),
			]),
			m(
				'svg.chart-card__svg',
				{
					viewBox: `0 0 ${w} ${height}`,
					preserveAspectRatio: 'none',
					style: { width: '100%', height: `${height}px` },
				},
				[
					// Y grid lines
					...yTicks.map((t) =>
						m('line', {
							x1: PAD_LEFT,
							y1: t.y,
							x2: w - PAD_RIGHT,
							y2: t.y,
							stroke: 'var(--border-color)',
							'stroke-width': 0.2,
						})
					),

					// Y labels
					...yTicks.map((t) =>
						m(
							'text',
							{
								x: PAD_LEFT - 3,
								y: t.y + 1,
								'text-anchor': 'end',
								fill: 'var(--text-muted)',
								'font-size': 2.5,
								'font-family': 'var(--font-family)',
							},
							t.label
						)
					),

					// Bars or area
					variant === 'bar'
						? data.map((d, i) => {
								const barH = (d.count / maxVal) * plotH;
								const x = PAD_LEFT + i * barW + barW * 0.15;
								const bw = barW * 0.7;
								return m('rect', {
									key: d.date,
									x,
									y: PAD_TOP + plotH - barH,
									width: Math.max(bw, 0.3),
									height: barH,
									fill: color,
									rx: 0.3,
									opacity: 0.85,
								});
							})
						: [
								// Area fill
								m('path', {
									d: areaPath(data, maxVal, plotW, plotH, PAD_LEFT, PAD_TOP),
									fill: color,
									opacity: 0.15,
								}),
								// Line
								m('polyline', {
									points: data
										.map((d, i) => {
											const x = PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
											const y = PAD_TOP + plotH - (d.count / maxVal) * plotH;
											return `${x},${y}`;
										})
										.join(' '),
									fill: 'none',
									stroke: color,
									'stroke-width': 0.6,
									'stroke-linejoin': 'round',
								}),
								// Dots
								...data.map((d, i) => {
									const x = PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
									const y = PAD_TOP + plotH - (d.count / maxVal) * plotH;
									return d.count > 0
										? m('circle', {
												key: d.date,
												cx: x,
												cy: y,
												r: 0.7,
												fill: color,
											})
										: null;
								}),
							],

					// X labels
					...xLabels.map(({ i, label }) => {
						const x =
							variant === 'bar'
								? PAD_LEFT + i * barW + barW / 2
								: PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotW;
						return m(
							'text',
							{
								x,
								y: height - 4,
								'text-anchor': 'middle',
								fill: 'var(--text-muted)',
								'font-size': 2.2,
								'font-family': 'var(--font-family)',
							},
							label
						);
					}),
				]
			),
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

// ── Multi-series stacked area chart ──────────────────────────────────

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

		// Align all series to same date axis
		const dateSet = new Set<string>();
		for (const s of series) for (const d of s.data) dateSet.add(d.date);
		const dates = Array.from(dateSet).sort();

		// Build per-date stacked totals
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
		const w = 100;
		const plotW = w - PAD_LEFT - PAD_RIGHT;
		const plotH = height - PAD_TOP - PAD_BOTTOM;

		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
			y: PAD_TOP + plotH * (1 - pct),
			label: Math.round(maxVal * pct).toString(),
		}));

		const labelStep = Math.max(1, Math.floor(dates.length / 6));

		return m('.chart-card', [
			m('.chart-card__header', [
				m('.chart-card__title', title),
				m(
					'.chart-card__legend',
					series.map((s) =>
						m('.chart-card__legend-item', { key: s.label }, [
							m('.chart-card__legend-dot', { style: { background: s.color } }),
							s.label,
						])
					)
				),
			]),
			m(
				'svg.chart-card__svg',
				{
					viewBox: `0 0 ${w} ${height}`,
					preserveAspectRatio: 'none',
					style: { width: '100%', height: `${height}px` },
				},
				[
					// Y grid
					...yTicks.map((t) =>
						m('line', {
							x1: PAD_LEFT,
							y1: t.y,
							x2: w - PAD_RIGHT,
							y2: t.y,
							stroke: 'var(--border-color)',
							'stroke-width': 0.2,
						})
					),
					...yTicks.map((t) =>
						m(
							'text',
							{
								x: PAD_LEFT - 3,
								y: t.y + 1,
								'text-anchor': 'end',
								fill: 'var(--text-muted)',
								'font-size': 2.5,
								'font-family': 'var(--font-family)',
							},
							t.label
						)
					),

					// Stacked bars
					...stacked.flatMap((col, i) => {
						const barW = plotW / dates.length;
						const x = PAD_LEFT + i * barW + barW * 0.1;
						const bw = barW * 0.8;
						return col.layers.map((layer) => {
							const h = ((layer.y1 - layer.y0) / maxVal) * plotH;
							const y = PAD_TOP + plotH - (layer.y1 / maxVal) * plotH;
							return h > 0
								? m('rect', {
										key: `${col.date}-${layer.label}`,
										x,
										y,
										width: Math.max(bw, 0.3),
										height: Math.max(h, 0.1),
										fill: layer.color,
										rx: 0.15,
									})
								: null;
						});
					}),

					// X labels
					...dates
						.filter((_, i) => i % labelStep === 0 || i === dates.length - 1)
						.map((date, _, arr) => {
							const i = dates.indexOf(date);
							const barW = plotW / dates.length;
							const x = PAD_LEFT + i * barW + barW / 2;
							return m(
								'text',
								{
									key: date,
									x,
									y: height - 4,
									'text-anchor': 'middle',
									fill: 'var(--text-muted)',
									'font-size': 2.2,
									'font-family': 'var(--font-family)',
								},
								formatDateLabel(date)
							);
						}),
				]
			),
		]);
	},
};

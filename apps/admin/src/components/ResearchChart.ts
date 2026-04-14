import m from 'mithril';
import type { TimeBucket, TimeScope } from '../state/research';
import { setTimeScope } from '../state/research';
import { RESEARCH_CATEGORY_COLORS } from '@freedi/shared-types';
import type { ResearchCategory } from '@freedi/shared-types';

// ── Series derived from shared constants ────────────────────────────

const CATEGORY_LABELS: Record<ResearchCategory, string> = {
	logins: 'Logins',
	evaluations: 'Evaluations',
	votes: 'Votes',
	statements: 'Statements',
	proposals: 'Proposals',
	screenViews: 'Screen Views',
};

const SERIES: Array<{ key: keyof TimeBucket; label: string; color: string }> = (
	Object.keys(RESEARCH_CATEGORY_COLORS) as ResearchCategory[]
).map((cat) => ({
	key: cat as keyof TimeBucket,
	label: CATEGORY_LABELS[cat],
	color: RESEARCH_CATEGORY_COLORS[cat],
}));

const SCOPES: Array<{ value: TimeScope; label: string }> = [
	{ value: '1h',  label: '1 Hour' },
	{ value: '12h', label: '12 Hours' },
	{ value: '24h', label: '24 Hours' },
	{ value: '1w',  label: '1 Week' },
	{ value: '1m',  label: '1 Month' },
];

// ── SVG constants ───────────────────────────────────────────────────

const VB_W = 800;
const VB_H = 280;
const PAD_L = 45;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

// ── Component ───────────────────────────────────────────────────────

export interface ResearchChartAttrs {
	data: TimeBucket[];
	scope: TimeScope;
}

interface TooltipState {
	visible: boolean;
	x: number;
	y: number;
	bucket: TimeBucket | null;
}

const tooltip: TooltipState = { visible: false, x: 0, y: 0, bucket: null };

export const ResearchChart: m.Component<ResearchChartAttrs> = {
	view(vnode) {
		const { data, scope } = vnode.attrs;

		if (data.length === 0) {
			return m('.chart-card', [
				m('.chart-card__title', 'Activity Timeline'),
				m('.chart-card__empty', 'No data'),
			]);
		}

		// Find max individual value for Y scale (not stacked)
		let maxVal = 1;
		for (const bucket of data) {
			for (const s of SERIES) {
				const val = (bucket[s.key] as number) || 0;
				if (val > maxVal) maxVal = val;
			}
		}
		maxVal = niceMax(maxVal);

		const n = Math.max(data.length - 1, 1);
		const stepX = PLOT_W / n;

		// Y axis ticks
		const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
			y: PAD_T + PLOT_H * (1 - pct),
			label: Math.round(maxVal * pct).toString(),
		}));

		// X axis labels (show ~8 labels max)
		const labelStep = Math.max(1, Math.floor(data.length / 8));

		const svgChildren: m.Children[] = [];

		// Grid lines
		for (const t of yTicks) {
			svgChildren.push(
				m('line', {
					x1: PAD_L, y1: t.y,
					x2: VB_W - PAD_R, y2: t.y,
					stroke: 'var(--border-color, #e2e8f0)',
					'stroke-width': 0.5,
				}),
			);
			svgChildren.push(
				m('text', {
					x: PAD_L - 6, y: t.y + 3.5,
					'text-anchor': 'end',
					fill: 'var(--text-muted, #94a3b8)',
					'font-size': 9,
					'font-family': 'var(--font-family)',
				}, t.label),
			);
		}

		// Lines + filled area + dots for each series
		for (const s of SERIES) {
			const points: Array<{ x: number; y: number; val: number }> = [];
			for (let i = 0; i < data.length; i++) {
				const val = (data[i][s.key] as number) || 0;
				const x = PAD_L + i * stepX;
				const y = PAD_T + PLOT_H - (val / maxVal) * PLOT_H;
				points.push({ x, y, val });
			}

			// Skip series with all zeros
			if (points.every((p) => p.val === 0)) continue;

			// Filled area under the line
			const areaD =
				`M${points.map((p) => `${p.x},${p.y}`).join(' L')}` +
				` L${points[points.length - 1].x},${PAD_T + PLOT_H}` +
				` L${points[0].x},${PAD_T + PLOT_H} Z`;
			svgChildren.push(
				m('path', {
					d: areaD, fill: s.color, opacity: 0.08,
					style: { transition: 'd 0.6s ease' },
				}),
			);

			// Line path (using path instead of polyline for smooth d transitions)
			const lineD = `M${points.map((p) => `${p.x},${p.y}`).join(' L')}`;
			svgChildren.push(
				m('path', {
					d: lineD,
					fill: 'none',
					stroke: s.color,
					'stroke-width': 2,
					'stroke-linejoin': 'round',
					'stroke-linecap': 'round',
					style: { transition: 'd 0.6s ease' },
				}),
			);

			// Dots at non-zero points with animated position
			for (const p of points) {
				if (p.val > 0) {
					svgChildren.push(
						m('circle', {
							cx: p.x, cy: p.y, r: 3, fill: s.color,
							style: { transition: 'cx 0.6s ease, cy 0.6s ease' },
						}),
					);
				}
			}
		}

		// Invisible hitboxes for tooltip (one per bucket)
		const hitW = PLOT_W / data.length;
		for (let i = 0; i < data.length; i++) {
			const bucket = data[i];
			const cx = PAD_L + i * stepX;
			svgChildren.push(
				m('rect', {
					x: cx - hitW / 2,
					y: PAD_T,
					width: hitW,
					height: PLOT_H,
					fill: 'transparent',
					style: { cursor: 'pointer' },
					onmouseenter: () => {
						tooltip.visible = true;
						tooltip.x = cx;
						tooltip.y = PAD_T;
						tooltip.bucket = bucket;
						m.redraw();
					},
					onmouseleave: () => {
						tooltip.visible = false;
						m.redraw();
					},
				}),
			);
		}

		// Vertical hover line
		if (tooltip.visible) {
			svgChildren.push(
				m('line', {
					x1: tooltip.x, y1: PAD_T,
					x2: tooltip.x, y2: PAD_T + PLOT_H,
					stroke: 'var(--text-muted, #94a3b8)',
					'stroke-width': 0.5,
					'stroke-dasharray': '3,3',
				}),
			);
		}

		// X labels
		for (let i = 0; i < data.length; i++) {
			if (i % labelStep === 0 || i === data.length - 1) {
				svgChildren.push(
					m('text', {
						x: PAD_L + i * stepX,
						y: VB_H - 8,
						'text-anchor': 'middle',
						fill: 'var(--text-muted, #94a3b8)',
						'font-size': 8,
						'font-family': 'var(--font-family)',
					}, data[i].label),
				);
			}
		}

		// Tooltip
		if (tooltip.visible && tooltip.bucket) {
			svgChildren.push(renderTooltip(tooltip.x, tooltip.y, tooltip.bucket));
		}

		return m('.chart-card', [
			m('.chart-card__header', [
				m('.chart-card__title', 'Activity Timeline'),
				m('.research__scope-toggle',
					SCOPES.map((s) =>
						m('button.research__scope-btn', {
							class: scope === s.value ? 'research__scope-btn--active' : '',
							onclick: () => setTimeScope(s.value),
						}, s.label),
					),
				),
			]),

			// Legend
			m('.research__chart-legend',
				SERIES.map((s) =>
					m('.research__chart-legend-item', [
						m('span.research__chart-legend-dot', { style: { background: s.color } }),
						s.label,
					]),
				),
			),

			// SVG chart
			m('svg.chart-card__svg', {
				viewBox: `0 0 ${VB_W} ${VB_H}`,
				style: { width: '100%', height: 'auto' },
			}, svgChildren),
		]);
	},
};

// ── Tooltip renderer ────────────────────────────────────────────────

function renderTooltip(x: number, y: number, bucket: TimeBucket): m.Vnode {
	const TT_W = 150;
	const LINE_H = 16;
	const PAD = 10;
	const activeSeries = SERIES.filter((s) => (bucket[s.key] as number) > 0);
	const TT_H = PAD * 2 + 18 + activeSeries.length * LINE_H;

	// Keep tooltip inside viewbox
	let tx = x - TT_W / 2;
	if (tx < PAD_L) tx = PAD_L;
	if (tx + TT_W > VB_W - PAD_R) tx = VB_W - PAD_R - TT_W;
	const ty = y - TT_H - 8;

	const children: m.Children[] = [];

	// Background
	children.push(
		m('rect', {
			x: tx, y: ty,
			width: TT_W, height: TT_H,
			rx: 6,
			fill: 'var(--sidebar-bg, #1e293b)',
			opacity: 0.95,
		}),
	);

	// Time label
	children.push(
		m('text', {
			x: tx + PAD, y: ty + PAD + 12,
			fill: 'white',
			'font-size': 11,
			'font-weight': '600',
			'font-family': 'var(--font-family)',
		}, bucket.label),
	);

	// Series values
	let lineY = ty + PAD + 18 + LINE_H;
	for (const s of activeSeries) {
		const val = bucket[s.key] as number;
		children.push(
			m('circle', { cx: tx + PAD + 4, cy: lineY - 4, r: 4, fill: s.color }),
		);
		children.push(
			m('text', {
				x: tx + PAD + 14, y: lineY,
				fill: 'rgba(255,255,255,0.85)',
				'font-size': 10,
				'font-family': 'var(--font-family)',
			}, `${s.label}: ${val}`),
		);
		lineY += LINE_H;
	}

	if (activeSeries.length === 0) {
		children.push(
			m('text', {
				x: tx + PAD, y: ty + PAD + 34,
				fill: 'rgba(255,255,255,0.5)',
				'font-size': 10,
				'font-family': 'var(--font-family)',
			}, 'No activity'),
		);
	}

	return m('g.research__tooltip', children);
}

// ── Helpers ─────────────────────────────────────────────────────────

function niceMax(v: number): number {
	if (v <= 5) return 5;
	if (v <= 10) return 10;
	const mag = Math.pow(10, Math.floor(Math.log10(v)));
	const norm = v / mag;
	if (norm <= 2) return 2 * mag;
	if (norm <= 5) return 5 * mag;

	return 10 * mag;
}

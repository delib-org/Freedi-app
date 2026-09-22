import m from 'mithril';
import {
	layoutChart,
	type ChartGeometry,
	type ChartSpec,
	type Primitive,
} from '@freedi/shared-charts';
import { getLang, isRTL, t } from '../lib/i18n';

export interface ChartAttrs {
	spec: ChartSpec;
	/** What the picture is of — the SVG's accessible name and the data table's caption */
	title: string;
	height?: number;
	/** Print the legend chips under the picture */
	legend?: boolean;
	/** A sparkline in a table cell: fixed width, no table toggle, no focus stops */
	compact?: boolean;
	/** Force reading direction; defaults to the document's */
	dir?: 'ltr' | 'rtl';
}

const SPARK_WIDTH = 180;
const SPARK_HEIGHT = 64;
const CHART_HEIGHT = 260;
const HBAR_ROW = 40;
const MIN_WIDTH = 240;
const PERCENT = 100;

function primitive(p: Primitive): m.Children {
	switch (p.type) {
		case 'rect':
			return m('rect', { class: p.cls, x: p.x, y: p.y, width: p.w, height: p.h, rx: p.rx });
		case 'path':
			return m('path', { class: p.cls, d: p.d });
		case 'line':
			return m('line', { class: p.cls, x1: p.x1, x2: p.x2, y1: p.y1, y2: p.y2 });
		case 'circle':
			return m('circle', { class: p.cls, cx: p.cx, cy: p.cy, r: p.r });
		case 'text':
			return m(
				'text',
				{ class: p.cls, x: p.x, y: p.y, 'text-anchor': p.anchor, 'dominant-baseline': p.baseline },
				p.text,
			);
	}
}

function defaultHeight(spec: ChartSpec, compact: boolean): number {
	if (compact || spec.kind === 'strip') return SPARK_HEIGHT;
	if (spec.kind === 'hbars') return Math.max(1, spec.rows.length) * HBAR_ROW + 8;

	return CHART_HEIGHT;
}

function swatchClass(slot: number | 'muted' | undefined): string | undefined {
	if (slot === undefined) return undefined;

	return `chart__swatch chart__swatch--${slot === 'muted' ? 'muted' : `s${slot}`}`;
}

/**
 * One chart: the shared geometry drawn as SVG, a tooltip over the hovered or
 * focused hit, legend chips, and the accessible table behind a toggle.
 *
 * The SVG keeps `direction="ltr"` on purpose — the geometry already mirrored
 * itself for RTL, and letting the document flip it again would undo that.
 */
export function Chart(): m.Component<ChartAttrs> {
	let active: number | null = null;
	let table = false;
	let width = 600;
	let observer: ResizeObserver | undefined;

	function tooltip(g: ChartGeometry, hit: ChartGeometry['hits'][number], rtl: boolean): m.Children {
		// Percentages of the viewBox, so the tip lands on the hit at any
		// rendered size and needs no measuring.
		const cx = ((hit.x + hit.w / 2) / g.viewBox.w) * PERCENT;
		const top = (hit.y / g.viewBox.h) * PERCENT;
		const flip = rtl ? cx < PERCENT / 2 : cx > PERCENT / 2;

		return m(
			'.chart__tip',
			{
				role: 'status',
				class: flip ? 'chart__tip--flip' : undefined,
				style: { insetInlineStart: `${cx}%`, insetBlockStart: `${top}%` },
			},
			[
				m('.chart__tip-title', hit.label),
				...hit.lines.map((line) =>
					m('.chart__tip-line', [
						line.slot !== undefined ? m('i', { class: swatchClass(line.slot) }) : null,
						m('span', line.label),
						m('span.chart__tip-value', line.value),
					]),
				),
			],
		);
	}

	function dataTable(g: ChartGeometry, title: string): m.Children {
		return m('table.chart__table', [
			m('caption', title),
			m(
				'thead',
				m(
					'tr',
					g.a11y.table.head.map((h, i) =>
						m('th', { scope: 'col' }, h || t(i === 0 ? 'chart.category' : 'chart.value')),
					),
				),
			),
			m(
				'tbody',
				g.a11y.table.rows.map((row) =>
					m(
						'tr',
						row.map((cell, i) => m(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, cell)),
					),
				),
			),
		]);
	}

	return {
		view({ attrs }) {
			const compact = attrs.compact === true;
			const dir = attrs.dir ?? (isRTL() ? 'rtl' : 'ltr');
			const g = layoutChart(attrs.spec, {
				width: compact ? SPARK_WIDTH : width,
				height: attrs.height ?? defaultHeight(attrs.spec, compact),
				dir,
				locale: getLang(),
				maxXLabels: 5,
			});
			const hit = g.hits.find((h) => h.index === active);

			return m(
				'.chart',
				{
					class: [table ? 'chart--table' : '', compact ? 'chart--compact' : '']
						.filter(Boolean)
						.join(' '),
					oncreate: ({ dom }: m.VnodeDOM) => {
						if (compact || typeof ResizeObserver === 'undefined') return;
						observer = new ResizeObserver(([entry]) => {
							const next = Math.max(MIN_WIDTH, Math.round(entry.contentRect.width));
							if (next !== width) {
								width = next;
								m.redraw();
							}
						});
						observer.observe(dom);
					},
					onremove: () => observer?.disconnect(),
					onkeydown: (e: KeyboardEvent) => {
						if (e.key === 'Escape') active = null;
					},
				},
				[
					m(
						'svg.chart__svg',
						{
							viewBox: `0 0 ${g.viewBox.w} ${g.viewBox.h}`,
							direction: 'ltr',
							preserveAspectRatio: 'xMidYMid meet',
							role: 'img',
							'aria-label': attrs.title,
						},
						[
							m('title', attrs.title),
							m('desc', g.a11y.desc),
							...g.primitives.map(primitive),
							...g.hits.map((h) =>
								m('rect.chart__hit', {
									x: h.x,
									y: h.y,
									width: h.w,
									height: h.h,
									tabindex: compact ? undefined : 0,
									'aria-label': `${h.label}: ${h.lines.map((l) => `${l.label} ${l.value}`).join(', ')}`,
									onmouseenter: () => {
										active = h.index;
									},
									onmouseleave: () => {
										active = null;
									},
									onfocus: () => {
										active = h.index;
									},
									onblur: () => {
										active = null;
									},
								}),
							),
						],
					),
					hit && !table ? tooltip(g, hit, dir === 'rtl') : null,
					attrs.legend && g.legend.length > 0
						? m(
								'ul.chart__legend',
								g.legend.map((l) =>
									m(
										'li.chart__legend-item',
										{ class: `chart__legend-item--${l.slot === 'muted' ? 'muted' : `s${l.slot}`}` },
										[m('i', { 'aria-hidden': 'true' }), `${l.icon ?? ''} ${l.label}`.trim()],
									),
								),
							)
						: null,
					compact
						? null
						: m(
								'button.btn.btn--sm.btn--ghost.chart__table-toggle',
								{
									type: 'button',
									'aria-pressed': table,
									onclick: () => {
										table = !table;
										active = null;
									},
								},
								t(table ? 'chart.hideTable' : 'chart.showTable'),
							),
					compact ? null : dataTable(g, attrs.title),
				],
			);
		},
	};
}

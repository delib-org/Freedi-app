import m from 'mithril';
import { layoutChart, type ChartSpec, type Primitive } from '@freedi/shared-charts';
import { getLang, isRTL, t } from '../lib/i18n';

export interface ChartAttrs {
	spec: ChartSpec;
	title: string;
	height?: number;
	legend?: boolean;
	compact?: boolean;
}
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
export function Chart(): m.Component<ChartAttrs> {
	let active: number | null = null;
	let table = false;
	let width = 600;
	let observer: ResizeObserver | undefined;

	return {
		view({ attrs }) {
			const g = layoutChart(attrs.spec, {
				width: attrs.compact ? 180 : width,
				height:
					attrs.height ??
					(attrs.compact || attrs.spec.kind === 'strip'
						? 64
						: attrs.spec.kind === 'hbars'
							? Math.max(1, attrs.spec.rows.length) * 40 + 8
							: 260),
				dir: isRTL() ? 'rtl' : 'ltr',
				locale: getLang(),
				maxXLabels: 5,
			});
			const hit = g.hits.find((h) => h.index === active);

			return m(
				'.chart',
				{
					class: table ? 'chart--table' : '',
					oncreate: ({ dom }: m.VnodeDOM) => {
						observer = new ResizeObserver(([entry]) => {
							const next = Math.max(240, Math.round(entry.contentRect.width));
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
							role: 'group',
							'aria-label': attrs.title,
						},
						[
							m('title', attrs.title),
							m('desc', `${attrs.title}. ${g.legend.map((item) => item.label).join(', ')}`),
							...g.primitives.map(primitive),
							...g.hits.map((h) =>
								m('rect.chart__hit', {
									x: h.x,
									y: h.y,
									width: h.w,
									height: h.h,
									tabindex: attrs.compact ? undefined : 0,
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
					hit && !table
						? m('.chart__tip', { role: 'status' }, [
								m('strong', hit.label),
								...hit.lines.map((l) => m('div', `${l.label}: ${l.value}`)),
							])
						: null,
					attrs.legend
						? m(
								'ul.chart__legend',
								g.legend.map((l) =>
									m(
										'li.chart__legend-item',
										{ class: `chart__legend-item--${l.slot === 'muted' ? 'muted' : `s${l.slot}`}` },
										[m('i', { 'aria-hidden': true }), `${l.icon ?? ''} ${l.label}`],
									),
								),
							)
						: null,
					!attrs.compact
						? m(
								'button.btn.btn--sm.btn--ghost',
								{
									type: 'button',
									'aria-pressed': table,
									onclick: () => {
										table = !table;
										active = null;
									},
								},
								t(table ? 'chart.hideTable' : 'chart.showTable'),
							)
						: null,
					!attrs.compact
						? m('table.chart__table', [
								m('caption', attrs.title),
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
											row.map((cell, i) =>
												m(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, cell),
											),
										),
									),
								),
							])
						: null,
				],
			);
		},
	};
}

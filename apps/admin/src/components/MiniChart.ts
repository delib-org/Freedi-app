import m from 'mithril';

export interface ChartItem {
	label: string;
	value: number;
	color: string;
}

export interface MiniChartAttrs {
	title: string;
	items: ChartItem[];
}

export const MiniChart: m.Component<MiniChartAttrs> = {
	view(vnode) {
		const { title, items } = vnode.attrs;
		const maxValue = Math.max(...items.map((i) => i.value), 1);

		return m('.mini-chart', [
			m('.mini-chart__title', title),
			items.map((item) =>
				m('.mini-chart__row', { key: item.label }, [
					m('.mini-chart__label', item.label),
					m(
						'.mini-chart__bar-track',
						m('.mini-chart__bar-fill', {
							style: {
								width: `${(item.value / maxValue) * 100}%`,
								background: item.color,
							},
						})
					),
					m('.mini-chart__value', item.value.toLocaleString()),
				])
			),
		]);
	},
};

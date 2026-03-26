import m from 'mithril';

export interface KpiCardAttrs {
	title: string;
	value: number | string;
	icon: string;
	gradient: string;
	trend?: string;
}

export const KpiCard: m.Component<KpiCardAttrs> = {
	view(vnode) {
		const { title, value, icon, gradient, trend } = vnode.attrs;

		return m(`.kpi-card.kpi-card--${gradient}`, [
			m('.kpi-card__icon', icon),
			m(
				'.kpi-card__value',
				typeof value === 'number' ? value.toLocaleString() : value
			),
			m('.kpi-card__title', title),
			trend && m('.kpi-card__trend', trend),
		]);
	},
};

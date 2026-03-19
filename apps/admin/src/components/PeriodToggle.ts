import m from 'mithril';

export type PeriodMode = 'daily' | 'monthly' | 'yearly';

export interface PeriodToggleAttrs {
	value: PeriodMode;
	onChange: (mode: PeriodMode) => void;
}

const options: Array<{ mode: PeriodMode; label: string }> = [
	{ mode: 'daily', label: 'Daily' },
	{ mode: 'monthly', label: 'Monthly' },
	{ mode: 'yearly', label: 'Yearly' },
];

export const PeriodToggle: m.Component<PeriodToggleAttrs> = {
	view(vnode) {
		const { value, onChange } = vnode.attrs;

		return m(
			'.period-toggle',
			options.map((opt) =>
				m(
					'button.period-toggle__btn',
					{
						class: opt.mode === value ? 'period-toggle__btn--active' : '',
						onclick: () => onChange(opt.mode),
					},
					opt.label,
				),
			),
		);
	},
};

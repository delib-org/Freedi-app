import m from 'mithril';
import { t } from '@/lib/i18n';

/** The top of a participant step: the way back, then its title and one line of guidance. */
export interface StepHeaderAttrs {
	title: string;
	titleId?: string;
	titleClass?: string;
	backHref?: string;
	eyebrow?: string;
	lead?: string;
}

export const StepHeader: m.Component<StepHeaderAttrs> = {
	view({ attrs }) {
		return m('.step-header', [
			attrs.backHref
				? m(
						m.route.Link,
						{ href: attrs.backHref, class: 'step-header__back' },
						t('tableAssignment.back'),
					)
				: null,
			attrs.eyebrow ? m('span.step-header__eyebrow', attrs.eyebrow) : null,
			m(
				'h1.screen__title',
				{ id: attrs.titleId, class: attrs.titleClass, dir: 'auto' },
				attrs.title,
			),
			attrs.lead ? m('p.step-header__lead', attrs.lead) : null,
		]);
	},
};

/** "Step 2 of 3": what the bar says during the steps. */
export function stepLabel(current: number, total: number): string {
	return t('tableAssignment.steps.label', { current, total });
}

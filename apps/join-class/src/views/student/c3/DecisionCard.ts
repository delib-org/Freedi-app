import m from 'mithril';
import { t } from '@/lib/i18n';

export interface DecisionCardAttrs {
	/** The decided proposal's text; null while the decision is not made. */
	text: string | null;
	/** A line under the text: how it was decided ("the most agreed proposal", "a tie, decided by the ratings"). */
	note?: string | null;
}

/** The teal card with "The decision" and the winning proposal (first thing on the summary). */
export const DecisionCard: m.Component<DecisionCardAttrs> = {
	view({ attrs }) {
		return m(
			'section.decision',
			{ class: attrs.text ? '' : 'decision--waiting', 'aria-label': t('summary.decision') },
			[
				m('p.decision__eyebrow', t('summary.decision')),
				attrs.text
					? m('p.decision__text', { dir: 'auto' }, attrs.text)
					: m('p.decision__waiting', t('summary.waiting')),
				attrs.text && attrs.note ? m('p.decision__note', attrs.note) : null,
			],
		);
	},
};

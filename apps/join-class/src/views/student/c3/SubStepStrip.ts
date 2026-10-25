import m from 'mithril';
import type { TableStep } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { TABLE_SUBSTEPS, type SubstepView } from '@/lib/classroom/c3Logic';

export interface SubStepStripAttrs {
	view: SubstepView;
	/** Switches the LOCAL view only; the table doc never changes. */
	onSelect: (step: TableStep) => void;
}

/**
 * Question · Talk · Write · Rate pills under the askers row (UX §11 last
 * bullet). They stay a tappable peek (Tal, 2026-10-22): the table's official
 * step carries the word "now" (not colour alone), `aria-current="step"` is the
 * screen the student is on, and TableFlow disables every control of a peeked
 * screen and offers "back to now".
 */
export const SubStepStrip: m.Component<SubStepStripAttrs> = {
	view({ attrs }) {
		const { view } = attrs;

		return m(
			'nav.substeps',
			{ 'aria-label': t('turn.strip_label') },
			TABLE_SUBSTEPS.proposals.map((step) =>
				m(
					'button.substeps__pill',
					{
						key: step,
						type: 'button',
						'aria-current': view.current === step ? 'step' : undefined,
						class: [
							view.current === step ? 'substeps__pill--on' : '',
							view.official === step ? 'substeps__pill--official' : '',
						]
							.filter(Boolean)
							.join(' '),
						'data-step': step,
						onclick: () => attrs.onSelect(step),
					},
					[
						t(`turn.pill_${step}`),
						view.official === step
							? m('span.substeps__now', { 'data-testid': 'pill-now' }, t('turn.pill_now'))
							: null,
					],
				),
			),
		);
	},
};

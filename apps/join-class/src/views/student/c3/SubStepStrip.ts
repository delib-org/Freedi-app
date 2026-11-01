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
 * Talk · Write · Rate pills (UX §11 last bullet, free sub-steps, Tal 2026-10-25):
 * a per-phone selector. The selected pill is `.substeps__pill--on` with
 * `aria-current="true"`; nothing is ever greyed out.
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
						'aria-current': view.current === step ? 'true' : undefined,
						class: view.current === step ? 'substeps__pill--on' : '',
						'data-step': step,
						onclick: () => attrs.onSelect(step),
					},
					t(`turn.pill_${step}`),
				),
			),
		);
	},
};

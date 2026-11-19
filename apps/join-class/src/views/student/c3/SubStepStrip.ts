import m from 'mithril';
import type { TableStep } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { TABLE_SUBSTEPS } from '@/lib/classroom/c3Logic';

export interface SubStepStripAttrs {
	/** The table's step: the part that is marked. */
	current: TableStep;
}

/**
 * Talk · Write · Rate, a READ-ONLY marker of where the table is (IA
 * join-class-proposals-flow §4, Tal 2026-11-19). The table moves through the
 * parts together, so nothing here is tappable: the current part is
 * `.substeps__pill--on` with `aria-current="step"`; a screen reader hears a list
 * of three with the current one named.
 */
export const SubStepStrip: m.Component<SubStepStripAttrs> = {
	view({ attrs }) {
		const { current } = attrs;

		return m(
			'nav.substeps',
			{ 'aria-label': t('turn.strip_label') },
			m(
				'ol.substeps__list',
				TABLE_SUBSTEPS.proposals.map((step) =>
					m(
						'li.substeps__pill',
						{
							key: step,
							'aria-current': current === step ? 'step' : undefined,
							class: current === step ? 'substeps__pill--on' : '',
							'data-step': step,
						},
						t(`turn.pill_${step}`),
					),
				),
			),
		);
	},
};

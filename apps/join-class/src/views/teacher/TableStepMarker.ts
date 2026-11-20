import m from 'mithril';
import type { TableStep } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { TABLE_SUBSTEPS } from '@/lib/classroom/c3Logic';

/**
 * "Talking › Writing › Rating" on a table card at Proposals (design assumption A11): the same
 * read-only marker the students see, current part bold. Nothing in it is a button. It replaces
 * the "Now: …" line there, so teacher and students read the same words. The words of the
 * current part name it for a screen reader ("Now: talking").
 */

export interface TableStepMarkerAttrs {
	current: TableStep;
}

export const TableStepMarker: m.Component<TableStepMarkerAttrs> = {
	view({ attrs }) {
		return m(
			'ol.table-step-marker',
			{ 'aria-label': t(`console.now_${attrs.current}`), 'data-testid': 'table-step-marker' },
			TABLE_SUBSTEPS.proposals.map((step) =>
				m(
					'li.table-step-marker__part',
					{
						key: step,
						class: step === attrs.current ? 'table-step-marker__part--current' : '',
						'aria-current': step === attrs.current ? 'step' : undefined,
					},
					t(`turn.pill_${step}`),
				),
			),
		);
	},
};

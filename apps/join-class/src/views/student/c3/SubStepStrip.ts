import m from 'mithril';
import type { TableStep } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { TABLE_SUBSTEPS, type FlowKind, type SubstepView } from '@/lib/classroom/c3Logic';

export interface SubStepStripAttrs {
	kind: FlowKind;
	view: SubstepView;
	/** Switches the LOCAL view only; the table doc never changes. */
	onSelect: (step: TableStep) => void;
}

/**
 * Question · Talk · Write · Rate pills under the asker line (UX §11 last
 * bullet). The table's official step is marked; `aria-current="step"` is the
 * screen the student is on.
 */
export const SubStepStrip: m.Component<SubStepStripAttrs> = {
	view({ attrs }) {
		const { kind, view } = attrs;

		return m(
			'nav.substeps',
			{ 'aria-label': t('turn.strip_label') },
			TABLE_SUBSTEPS[kind].map((step) =>
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
						onclick: () => attrs.onSelect(step),
					},
					t(`turn.pill_${step}`),
				),
			),
		);
	},
};

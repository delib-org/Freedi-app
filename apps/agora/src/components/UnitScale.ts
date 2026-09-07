import m from 'mithril';
import { t } from '../lib/i18n';
import { AGORA_ROUND, type AgoraUnitRating } from '@freedi/shared-types';

export interface UnitScaleAttrs {
	value?: AgoraUnitRating;
	disabled?: boolean;
	onPick: (value: AgoraUnitRating) => void;
}

/**
 * The 0…1 scale of the needs and vision rounds: five steps from "not for
 * me" to "very much". A radiogroup, not five buttons — the steps are one
 * question with five answers. No firebase here; the view writes.
 */
export const UnitScale: m.Component<UnitScaleAttrs> = {
	view(vnode) {
		const { value, disabled, onPick } = vnode.attrs;

		return m(
			'.unit-scale',
			{ role: 'radiogroup', 'aria-label': t('round.unit_aria') },
			AGORA_ROUND.UNIT_STEPS.map((step, index) => {
				const on = value === step;

				return m(
					'button.unit-scale__step',
					{
						key: step,
						type: 'button',
						role: 'radio',
						'aria-checked': on ? 'true' : 'false',
						class: on ? 'unit-scale__step--on' : undefined,
						'data-step': String(index),
						disabled: disabled === true,
						onclick: () => onPick(step),
					},
					[
						m('span.unit-scale__pip', { 'aria-hidden': 'true' }),
						m('span.unit-scale__label', t(`round.unit_${index}`)),
					],
				);
			}),
		);
	},
};

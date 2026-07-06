import m from 'mithril';

export interface CampScaleAttrs {
	leftLabel: string;
	rightLabel: string;
	/** 0-100, position along the bridge */
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
}

/**
 * The bridge between the camps: a themed range input where the student
 * literally places their marker between the two sides. The track blends
 * the camp colors; the thumb is the student's lantern.
 */
export const CampScale: m.Component<CampScaleAttrs> = {
	view(vnode) {
		const { leftLabel, rightLabel, value, onChange, disabled } = vnode.attrs;

		return m('.camp-scale', [
			m('.camp-scale__labels', [
				m('span.camp-scale__label.camp-scale__label--left', leftLabel),
				m('span.camp-scale__label.camp-scale__label--right', rightLabel),
			]),
			m('input.camp-scale__slider[type=range]', {
				min: 0,
				max: 100,
				value,
				disabled,
				// The scale is a physical bridge on the map — the left camp sits at
				// the palace regardless of text direction, so keep the slider LTR.
				dir: 'ltr',
				'aria-label': `${leftLabel} ↔ ${rightLabel}`,
				oninput: (event: InputEvent) => {
					onChange(Number((event.target as HTMLInputElement).value));
				},
			}),
		]);
	},
};

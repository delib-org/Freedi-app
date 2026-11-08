import m from 'mithril';
import { SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * The position slider, copied from the classroom's side slider (join-class):
 * a native range over a two-colour track, a character at each end and a live
 * word label that is also the aria-valuetext. Pole A is always the left end
 * (`dir=ltr`) so the poles never swap under RTL.
 *
 * `value === null` is the explicit "not specified" state: the thumb is
 * hidden until the person touches the slider, and it is never the middle.
 */
export interface SideSliderAttrs {
	value: number | null;
	labelA: string;
	labelB: string;
	onInput: (value: number) => void;
	/** Optional: shown as a "not specified" button when a position is set. */
	onClear?: () => void;
}

const NEAR_THRESHOLD_PERCENT = 25;
const FAR_END_PERCENT = SIDE_MAX - NEAR_THRESHOLD_PERCENT;

/** i18n key of the word for a position: near A, in between, near B. */
export function positionWordKey(value: number | null): string {
	if (value === null) return 'tableAssignment.position.unknown';
	if (value <= SIDE_MIN + NEAR_THRESHOLD_PERCENT) return 'tableAssignment.position.nearA';
	if (value >= FAR_END_PERCENT) return 'tableAssignment.position.nearB';

	return 'tableAssignment.position.between';
}

function character(side: 'a' | 'b', name: string): m.Vnode {
	return m(`.side-slider__character.side-slider__character--${side}`, [
		m('span.side-slider__face', { 'aria-hidden': 'true' }, Array.from(name)[0] ?? ''),
		m('span.side-slider__name', name),
	]);
}

export const SideSlider: m.Component<SideSliderAttrs> = {
	view({ attrs }) {
		const { value, labelA, labelB, onInput, onClear } = attrs;
		const word = t(positionWordKey(value), { a: labelA, b: labelB });
		const unspecified = value === null;

		return m('.side-slider', { dir: 'ltr', class: unspecified ? 'side-slider--unspecified' : '' }, [
			m('.side-slider__ends', [character('a', labelA), character('b', labelB)]),
			m('.side-slider__field', [
				m('.side-slider__track', { 'aria-hidden': 'true' }, [
					m('span.side-slider__half.side-slider__half--a'),
					m('span.side-slider__tick'),
					m('span.side-slider__half.side-slider__half--b'),
				]),
				m('input.side-slider__input', {
					type: 'range',
					min: SIDE_MIN,
					max: SIDE_MAX,
					step: 1,
					value: value ?? (SIDE_MIN + SIDE_MAX) / 2,
					'aria-label': t('tableAssignment.position.aria', { a: labelA, b: labelB }),
					'aria-valuetext': word,
					oninput: (event: Event) => onInput(Number((event.target as HTMLInputElement).value)),
					// A tap on the track without a drag still counts as an answer.
					onclick: (event: Event) => onInput(Number((event.target as HTMLInputElement).value)),
				}),
			]),
			m('.side-slider__word', { dir: 'auto' }, word),
			onClear && !unspecified
				? m(
						'button.btn.btn--ghost',
						{ type: 'button', onclick: onClear },
						t('tableAssignment.position.clear'),
					)
				: null,
		]);
	},
};

import m from 'mithril';
import { SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';
import { isRTL, t } from '@/lib/i18n';
import { sideWordKey } from '@/views/student/c2/c2Helpers';

/**
 * The side slider (UX §7): a native `<input type=range dir=ltr>` over a custom
 * two-colour track, a character at each end, a 48 px thumb and a live word
 * label that is also the `aria-valuetext`. Side A is always the left end
 * (`dir=ltr`) so the sides never swap under RTL. Props in, events out.
 */
export interface SideSliderAttrs {
	value: number;
	nameA: string;
	nameB: string;
	onInput: (value: number) => void;
}

function character(side: 'a' | 'b', name: string): m.Vnode {
	return m(`.side-slider__character.side-slider__character--${side}`, [
		m('span.side-slider__face', { 'aria-hidden': 'true' }, Array.from(name)[0] ?? ''),
		m('span.side-slider__name', name),
	]);
}

export const SideSlider: m.Component<SideSliderAttrs> = {
	view({ attrs }) {
		const { value, nameA, nameB, onInput } = attrs;
		const word = t(sideWordKey(value), {
			name: sideWordKey(value) === 'side.near_a' ? nameA : nameB,
		});

		return m('.side-slider', { dir: 'ltr' }, [
			m('.side-slider__ends', [character('a', nameA), character('b', nameB)]),
			m('.side-slider__field', [
				m('.side-slider__track', { 'aria-hidden': 'true' }, [
					m('span.side-slider__half.side-slider__half--a'),
					m('span.side-slider__tick'),
					m('span.side-slider__half.side-slider__half--b'),
				]),
				m('input.side-slider__input', {
					type: 'range',
					'data-testid': 'side-slider',
					min: SIDE_MIN,
					max: SIDE_MAX,
					step: 1,
					value,
					'aria-label': t('side.aria', { a: nameA, b: nameB }),
					'aria-valuetext': word,
					oninput: (e: Event) => onInput(Number((e.target as HTMLInputElement).value)),
				}),
			]),
			m('.side-slider__word', { 'aria-hidden': 'true', dir: isRTL() ? 'rtl' : 'ltr' }, word),
		]);
	},
};

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { CAMP_A_BELOW, CAMP_B_ABOVE, SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';

vi.mock('@/lib/i18n', () => ({
	isRTL: () => true,
	t: (key: string) => key,
}));

import { SideSlider } from '../SideSlider';

afterEach(() => {
	document.body.innerHTML = '';
});

function mount(value: number): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	m.render(
		root,
		m(SideSlider, { value, nameA: 'Side A', nameB: 'Side B', onInput: () => undefined }),
	);

	return root.querySelector('.side-slider') as HTMLElement;
}

/**
 * `data-camp` is what lets a look draw the thumb as the mark of the side it
 * stands on (circle, diamond, rounded square). It follows the same thresholds
 * as the word under the thumb.
 */
describe('SideSlider data-camp', () => {
	it('names side A below the centre band', () => {
		expect(mount(SIDE_MIN).dataset.camp).toBe('a');
		expect(mount(CAMP_A_BELOW - 1).dataset.camp).toBe('a');
	});

	it('names the centre inside the band, both edges included', () => {
		expect(mount(CAMP_A_BELOW).dataset.camp).toBe('center');
		expect(mount(CAMP_B_ABOVE).dataset.camp).toBe('center');
	});

	it('names side B above the centre band', () => {
		expect(mount(CAMP_B_ABOVE + 1).dataset.camp).toBe('b');
		expect(mount(SIDE_MAX).dataset.camp).toBe('b');
	});

	it('keeps the slider left-to-right and the range input as it was', () => {
		const slider = mount(SIDE_MIN);
		const input = slider.querySelector('input.side-slider__input') as HTMLInputElement;

		expect(slider.getAttribute('dir')).toBe('ltr');
		expect(input.type).toBe('range');
		expect(input.getAttribute('aria-valuetext')).toBe('side.near_a');
	});
});

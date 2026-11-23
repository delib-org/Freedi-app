// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/i18n', () => ({
	t: (key: string) => key,
}));

import { Countdown } from '../Countdown';

const TOTAL_MS = 60_000;

afterEach(() => {
	m.render(document.body, null);
	document.body.innerHTML = '';
	vi.useRealTimers();
});

function mount(endsAt: number | undefined): HTMLElement {
	m.render(document.body, m(Countdown, { endsAt, totalMs: TOTAL_MS, quietEnd: true }));

	return document.body.querySelector('.count') as HTMLElement;
}

function fractionOf(count: HTMLElement): number {
	return Number(count.style.getPropertyValue('--count-fraction'));
}

/**
 * `--count-fraction` is the share of the time that is left (1 = all of it). A
 * look may draw it as a ring; the bar keeps using the same number.
 */
describe('Countdown --count-fraction', () => {
	it('is the whole time before the interval starts', () => {
		const count = mount(undefined);

		expect(fractionOf(count)).toBe(1);
		expect(count.classList.contains('count--idle')).toBe(true);
	});

	it('is the share left while the interval runs, the same number as the bar', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const count = mount(1_000_000 + TOTAL_MS / 2);
		const fill = count.querySelector('.count__fill') as HTMLElement;

		expect(fractionOf(count)).toBeGreaterThan(0.4);
		expect(fractionOf(count)).toBeLessThanOrEqual(0.5);
		expect(fill.style.transform).toBe(`scaleX(${fractionOf(count)})`);
	});

	it('is zero once the time is over', () => {
		vi.useFakeTimers();
		vi.setSystemTime(2_000_000);

		expect(fractionOf(mount(2_000_000 - 5_000))).toBe(0);
	});
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCK_HEIGHT_VAR, watchDockHeight } from '../dockHeight';

const published = (): string => document.documentElement.style.getPropertyValue(DOCK_HEIGHT_VAR);

function band(height: number, position: string): HTMLElement {
	const el = document.createElement('section');
	el.style.position = position;
	el.getBoundingClientRect = () => ({ height }) as DOMRect;
	document.body.appendChild(el);

	return el;
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
	document.documentElement.style.removeProperty(DOCK_HEIGHT_VAR);
});

describe('the dock height the board pads for', () => {
	it('publishes the measured height of a fixed dock, rounded up', () => {
		const stop = watchDockHeight(band(111.4, 'fixed'));

		expect(published()).toBe('112px');
		stop();
	});

	it('is 0 where the band is not fixed (laptop)', () => {
		const stop = watchDockHeight(band(80, 'sticky'));

		expect(published()).toBe('0px');
		stop();
	});

	it('follows the dock when it changes size, and clears itself when stopped', () => {
		let notify: () => void = () => undefined;
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					notify = callback;
				}
				observe(): void {}
				disconnect(): void {}
			},
		);
		let height = 112;
		const el = band(0, 'fixed');
		el.getBoundingClientRect = () => ({ height }) as DOMRect;
		const stop = watchDockHeight(el);
		height = 150;
		notify();

		expect(published()).toBe('150px');
		stop();
		expect(published()).toBe('');
	});
});

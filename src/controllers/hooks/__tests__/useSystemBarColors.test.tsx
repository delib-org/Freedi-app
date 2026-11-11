import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import type { ReactNode } from 'react';

import { UI } from '@/constants/common';
import { useSystemBarColors } from '../useSystemBarColors';

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const PAGE = 'rgb(11, 15, 23)';
const LILAC = 'rgb(232, 226, 255)';
const BLUE = 'rgb(0, 0, 255)';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const content = (): string | undefined =>
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;

function mountHeader(color: string): HTMLElement {
	document.body.innerHTML =
		'<div class="page__header"><div class="page__header__full"></div></div>';

	const header = document.querySelector<HTMLElement>('.page__header') as HTMLElement;
	const body = document.querySelector<HTMLElement>('.page__header__full') as HTMLElement;

	body.style.backgroundColor = color;
	header.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 }) as DOMRect;

	return body;
}

const flushMutations = async (): Promise<void> => {
	await act(async () => {
		await Promise.resolve();
	});
};

describe('useSystemBarColors', () => {
	const media: Array<{ listeners: Array<() => void>; removed: number }> = [];

	beforeEach(() => {
		jest.useFakeTimers();
		document.head.innerHTML = '<meta name="theme-color" content="#fbfaf7">';
		document.body.innerHTML = '';
		document.body.style.backgroundColor = PAGE;
		media.length = 0;
		window.matchMedia = jest.fn().mockImplementation(() => {
			const entry = { listeners: [] as Array<() => void>, removed: 0 };

			media.push(entry);

			return {
				matches: false,
				addEventListener: (_: string, cb: () => void) => entry.listeners.push(cb),
				removeEventListener: () => {
					entry.removed += 1;
				},
			};
		});
	});

	afterEach(() => {
		jest.useRealTimers();
		document.documentElement.removeAttribute('data-contrast');
	});

	it('applies the page colour on mount when there is no header', () => {
		renderHook(() => useSystemBarColors(), { wrapper });

		expect(content()).toBe('#0b0f17');
	});

	it('re-syncs once more after the route settles (header painted late)', () => {
		const { result } = renderHook(
			() => {
				useSystemBarColors();

				return useNavigate();
			},
			{ wrapper },
		);

		act(() => result.current('/statement-screen/abc'));
		act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(content()).toBe('#0b0f17');

		mountHeader(LILAC);
		act(() => {
			jest.advanceTimersByTime(UI.DEBOUNCE_DELAY);
		});

		expect(content()).toBe('#e8e2ff');
	});

	it('follows a header colour change through the header observer', async () => {
		const headerBody = mountHeader(LILAC);

		renderHook(() => useSystemBarColors(), { wrapper });
		expect(content()).toBe('#e8e2ff');

		headerBody.style.backgroundColor = BLUE;
		await flushMutations();

		expect(content()).toBe('#0000ff');
	});

	it('never observes a subtree, so page animations cost nothing', () => {
		const observe = jest.spyOn(MutationObserver.prototype, 'observe');

		mountHeader(LILAC);
		renderHook(() => useSystemBarColors(), { wrapper });

		expect(observe).toHaveBeenCalled();
		expect(observe.mock.calls.every(([, options]) => !options?.subtree)).toBe(true);
		observe.mockRestore();
	});

	it('syncs when data-contrast changes on <html>', async () => {
		renderHook(() => useSystemBarColors(), { wrapper });
		expect(content()).toBe('#0b0f17');

		document.body.style.backgroundColor = 'rgb(0, 0, 0)';
		document.documentElement.dataset.contrast = 'high';
		await flushMutations();

		expect(content()).toBe('#000000');
	});

	it('syncs on OS colour-scheme change and on resize', () => {
		renderHook(() => useSystemBarColors(), { wrapper });

		document.body.style.backgroundColor = 'rgb(1, 2, 3)';
		act(() => media[0].listeners[0]());
		expect(content()).toBe('#010203');

		document.body.style.backgroundColor = 'rgb(4, 5, 6)';
		act(() => {
			window.dispatchEvent(new Event('resize'));
			jest.advanceTimersByTime(UI.DEBOUNCE_DELAY);
		});
		expect(content()).toBe('#040506');
	});

	it('releases its listeners on unmount', () => {
		const { unmount } = renderHook(() => useSystemBarColors(), { wrapper });

		unmount();

		expect(media.every((entry) => entry.removed === entry.listeners.length)).toBe(true);
	});
});

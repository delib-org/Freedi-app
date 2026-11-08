import type { KeyboardEvent, PointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { STORAGE_KEYS } from '@/constants/common';
import {
	clampSidebarWidth,
	SIDEBAR_WIDTH_DEFAULT,
	SIDEBAR_WIDTH_MAX,
	SIDEBAR_WIDTH_MIN,
	useSidebarWidth,
} from '../useSidebarWidth';

function keyEvent(key: string): KeyboardEvent<HTMLElement> {
	return { key, preventDefault: jest.fn() } as unknown as KeyboardEvent<HTMLElement>;
}

describe('useSidebarWidth', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	describe('clampSidebarWidth', () => {
		it('keeps a width inside the allowed range', () => {
			expect(clampSidebarWidth(300)).toBe(300);
			expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 50)).toBe(SIDEBAR_WIDTH_MIN);
			expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 50)).toBe(SIDEBAR_WIDTH_MAX);
		});

		it('rounds and falls back for a width that is not a number', () => {
			expect(clampSidebarWidth(240.6)).toBe(241);
			expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT);
		});
	});

	it('starts at the default and reports it to assistive tech', () => {
		const { result } = renderHook(() => useSidebarWidth());

		expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT);
		expect(result.current.separatorProps['aria-valuenow']).toBe(SIDEBAR_WIDTH_DEFAULT);
		expect(result.current.separatorProps.role).toBe('separator');
	});

	it('restores a stored width, clamped', () => {
		window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, '320');
		expect(renderHook(() => useSidebarWidth()).result.current.width).toBe(320);

		window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, '9999');
		expect(renderHook(() => useSidebarWidth()).result.current.width).toBe(SIDEBAR_WIDTH_MAX);

		window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, 'wide please');
		expect(renderHook(() => useSidebarWidth()).result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT);
	});

	it('widens with the arrow that points away from the rail, and persists', () => {
		const { result } = renderHook(() => useSidebarWidth('ltr'));

		act(() => result.current.separatorProps.onKeyDown(keyEvent('ArrowRight')));
		expect(result.current.width).toBeGreaterThan(SIDEBAR_WIDTH_DEFAULT);

		const widened = result.current.width;
		act(() => result.current.separatorProps.onKeyDown(keyEvent('ArrowLeft')));
		expect(result.current.width).toBeLessThan(widened);
		expect(window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)).toBe(
			String(result.current.width),
		);
	});

	it('mirrors the arrows in RTL, where the rail sits on the right', () => {
		const { result } = renderHook(() => useSidebarWidth('rtl'));

		act(() => result.current.separatorProps.onKeyDown(keyEvent('ArrowLeft')));
		expect(result.current.width).toBeGreaterThan(SIDEBAR_WIDTH_DEFAULT);
	});

	it('jumps to the ends with Home and End', () => {
		const { result } = renderHook(() => useSidebarWidth());

		act(() => result.current.separatorProps.onKeyDown(keyEvent('End')));
		expect(result.current.width).toBe(SIDEBAR_WIDTH_MAX);

		act(() => result.current.separatorProps.onKeyDown(keyEvent('Home')));
		expect(result.current.width).toBe(SIDEBAR_WIDTH_MIN);
	});

	it('ignores keys it does not own', () => {
		const { result } = renderHook(() => useSidebarWidth());

		act(() => result.current.separatorProps.onKeyDown(keyEvent('Enter')));
		expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT);
	});

	it('returns to the default on a double click', () => {
		const { result } = renderHook(() => useSidebarWidth());

		act(() => result.current.separatorProps.onKeyDown(keyEvent('End')));
		act(() => result.current.separatorProps.onDoubleClick());
		expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT);
	});

	describe('dragging', () => {
		function pointerDown(element: HTMLElement, clientX: number) {
			return {
				button: 0,
				clientX,
				pointerId: 1,
				currentTarget: element,
				preventDefault: jest.fn(),
			} as unknown as PointerEvent<HTMLElement>;
		}

		it('follows the pointer and stores the width once the drag ends', () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const { result } = renderHook(() => useSidebarWidth('ltr'));

			act(() => result.current.separatorProps.onPointerDown(pointerDown(element, 100)));
			expect(result.current.isResizing).toBe(true);

			act(() => {
				element.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, bubbles: true }));
			});
			expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT + 60);

			act(() => {
				element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
			});
			expect(result.current.isResizing).toBe(false);
			expect(window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)).toBe(
				String(SIDEBAR_WIDTH_DEFAULT + 60),
			);

			// The drag is over: later movement must not resize anything.
			act(() => {
				element.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, bubbles: true }));
			});
			expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT + 60);
			element.remove();
		});

		it('drags the other way in RTL', () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const { result } = renderHook(() => useSidebarWidth('rtl'));

			act(() => result.current.separatorProps.onPointerDown(pointerDown(element, 300)));
			act(() => {
				element.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, bubbles: true }));
			});
			expect(result.current.width).toBe(SIDEBAR_WIDTH_DEFAULT + 40);
			element.remove();
		});

		it('ignores a secondary button', () => {
			const element = document.createElement('div');
			const { result } = renderHook(() => useSidebarWidth());

			act(() =>
				result.current.separatorProps.onPointerDown({
					...pointerDown(element, 100),
					button: 2,
				} as unknown as PointerEvent<HTMLElement>),
			);
			expect(result.current.isResizing).toBe(false);
		});
	});
});

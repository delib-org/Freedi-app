/**
 * Tests for useWindowDimensions hook
 */

import { renderHook, act } from '@testing-library/react';
import useWindowDimensions from '../useWindowDimensions';

describe('useWindowDimensions', () => {
	// Store original window dimensions
	const originalInnerWidth = window.innerWidth;
	const originalInnerHeight = window.innerHeight;

	beforeEach(() => {
		// Reset to known dimensions
		Object.defineProperty(window, 'innerWidth', {
			writable: true,
			configurable: true,
			value: 1024,
		});
		Object.defineProperty(window, 'innerHeight', {
			writable: true,
			configurable: true,
			value: 768,
		});
	});

	afterEach(() => {
		// Restore original dimensions
		Object.defineProperty(window, 'innerWidth', {
			writable: true,
			configurable: true,
			value: originalInnerWidth,
		});
		Object.defineProperty(window, 'innerHeight', {
			writable: true,
			configurable: true,
			value: originalInnerHeight,
		});
	});

	describe('initial state', () => {
		it('should return initial window dimensions', () => {
			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(1024);
			expect(result.current.height).toBe(768);
		});

		it('should return object with width and height properties', () => {
			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current).toHaveProperty('width');
			expect(result.current).toHaveProperty('height');
		});
	});

	describe('resize handling', () => {
		it('should update dimensions on window resize', () => {
			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(1024);
			expect(result.current.height).toBe(768);

			// Simulate resize
			act(() => {
				Object.defineProperty(window, 'innerWidth', { value: 1920 });
				Object.defineProperty(window, 'innerHeight', { value: 1080 });
				window.dispatchEvent(new Event('resize'));
			});

			expect(result.current.width).toBe(1920);
			expect(result.current.height).toBe(1080);
		});

		it('should handle multiple resize events', () => {
			const { result } = renderHook(() => useWindowDimensions());

			// First resize
			act(() => {
				Object.defineProperty(window, 'innerWidth', { value: 800 });
				Object.defineProperty(window, 'innerHeight', { value: 600 });
				window.dispatchEvent(new Event('resize'));
			});

			expect(result.current.width).toBe(800);
			expect(result.current.height).toBe(600);

			// Second resize
			act(() => {
				Object.defineProperty(window, 'innerWidth', { value: 1440 });
				Object.defineProperty(window, 'innerHeight', { value: 900 });
				window.dispatchEvent(new Event('resize'));
			});

			expect(result.current.width).toBe(1440);
			expect(result.current.height).toBe(900);
		});

		it('should handle width-only change', () => {
			const { result } = renderHook(() => useWindowDimensions());

			act(() => {
				Object.defineProperty(window, 'innerWidth', { value: 500 });
				window.dispatchEvent(new Event('resize'));
			});

			expect(result.current.width).toBe(500);
			expect(result.current.height).toBe(768);
		});

		it('should handle height-only change', () => {
			const { result } = renderHook(() => useWindowDimensions());

			act(() => {
				Object.defineProperty(window, 'innerHeight', { value: 400 });
				window.dispatchEvent(new Event('resize'));
			});

			expect(result.current.width).toBe(1024);
			expect(result.current.height).toBe(400);
		});
	});

	describe('event listener management', () => {
		it('should add resize event listener on mount', () => {
			const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

			renderHook(() => useWindowDimensions());

			expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

			addEventListenerSpy.mockRestore();
		});

		it('should remove resize event listener on unmount', () => {
			const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

			const { unmount } = renderHook(() => useWindowDimensions());
			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});

		it('should not respond to resize after unmount', () => {
			const { result, unmount } = renderHook(() => useWindowDimensions());

			const initialWidth = result.current.width;
			unmount();

			// Change window dimensions after unmount
			Object.defineProperty(window, 'innerWidth', { value: 2000 });
			window.dispatchEvent(new Event('resize'));

			// Result should not change (it's unmounted)
			expect(result.current.width).toBe(initialWidth);
		});
	});

	describe('edge cases', () => {
		it('should handle very small dimensions', () => {
			Object.defineProperty(window, 'innerWidth', { value: 1 });
			Object.defineProperty(window, 'innerHeight', { value: 1 });

			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(1);
			expect(result.current.height).toBe(1);
		});

		it('should handle very large dimensions', () => {
			Object.defineProperty(window, 'innerWidth', { value: 10000 });
			Object.defineProperty(window, 'innerHeight', { value: 10000 });

			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(10000);
			expect(result.current.height).toBe(10000);
		});

		it('should handle mobile-like dimensions', () => {
			Object.defineProperty(window, 'innerWidth', { value: 375 });
			Object.defineProperty(window, 'innerHeight', { value: 667 });

			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(375);
			expect(result.current.height).toBe(667);
		});

		it('should handle tablet-like dimensions', () => {
			Object.defineProperty(window, 'innerWidth', { value: 768 });
			Object.defineProperty(window, 'innerHeight', { value: 1024 });

			const { result } = renderHook(() => useWindowDimensions());

			expect(result.current.width).toBe(768);
			expect(result.current.height).toBe(1024);
		});
	});
});

/**
 * Tests for useOnlineStatus hook
 *
 * Tests: online/offline state transitions, wasOffline reset after 5s
 */

import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

// Mock error handling
jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

describe('useOnlineStatus', () => {
	let originalNavigatorOnline: boolean;

	beforeEach(() => {
		jest.useFakeTimers();
		originalNavigatorOnline = navigator.onLine;
	});

	afterEach(() => {
		jest.useRealTimers();
		// Restore original navigator.onLine descriptor
		Object.defineProperty(navigator, 'onLine', {
			configurable: true,
			value: originalNavigatorOnline,
		});
	});

	// -----------------------------------------------------------------------
	// Initial state
	// -----------------------------------------------------------------------
	describe('initial state', () => {
		it('should reflect current navigator.onLine=true at mount', () => {
			Object.defineProperty(navigator, 'onLine', {
				configurable: true,
				value: true,
			});

			const { result } = renderHook(() => useOnlineStatus());

			expect(result.current.isOnline).toBe(true);
			expect(result.current.wasOffline).toBe(false);
		});

		it('should reflect current navigator.onLine=false at mount', () => {
			Object.defineProperty(navigator, 'onLine', {
				configurable: true,
				value: false,
			});

			const { result } = renderHook(() => useOnlineStatus());

			expect(result.current.isOnline).toBe(false);
			expect(result.current.wasOffline).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Going offline
	// -----------------------------------------------------------------------
	describe('going offline', () => {
		it('should set isOnline=false when offline event fires', () => {
			const { result } = renderHook(() => useOnlineStatus());

			act(() => {
				window.dispatchEvent(new Event('offline'));
			});

			expect(result.current.isOnline).toBe(false);
		});

		it('should not set wasOffline when going offline', () => {
			const { result } = renderHook(() => useOnlineStatus());

			act(() => {
				window.dispatchEvent(new Event('offline'));
			});

			expect(result.current.wasOffline).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Coming back online
	// -----------------------------------------------------------------------
	describe('coming back online', () => {
		it('should set isOnline=true when online event fires', () => {
			Object.defineProperty(navigator, 'onLine', {
				configurable: true,
				value: false,
			});
			const { result } = renderHook(() => useOnlineStatus());

			// Go offline first
			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			expect(result.current.isOnline).toBe(false);

			// Come back online
			act(() => {
				window.dispatchEvent(new Event('online'));
			});

			expect(result.current.isOnline).toBe(true);
		});

		it('should set wasOffline=true when coming back online', () => {
			const { result } = renderHook(() => useOnlineStatus());

			// Simulate offline → online transition
			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			act(() => {
				window.dispatchEvent(new Event('online'));
			});

			expect(result.current.wasOffline).toBe(true);
		});

		it('should reset wasOffline to false after 5 seconds', () => {
			const { result } = renderHook(() => useOnlineStatus());

			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			act(() => {
				window.dispatchEvent(new Event('online'));
			});

			expect(result.current.wasOffline).toBe(true);

			// Advance timers by 5 seconds
			act(() => {
				jest.advanceTimersByTime(5000);
			});

			expect(result.current.wasOffline).toBe(false);
		});

		it('should NOT reset wasOffline before 5 seconds', () => {
			const { result } = renderHook(() => useOnlineStatus());

			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			act(() => {
				window.dispatchEvent(new Event('online'));
			});

			// Advance by only 4 seconds
			act(() => {
				jest.advanceTimersByTime(4999);
			});

			// wasOffline should still be true
			expect(result.current.wasOffline).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Event listener cleanup
	// -----------------------------------------------------------------------
	describe('cleanup on unmount', () => {
		it('should remove event listeners on unmount', () => {
			const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
			const { unmount } = renderHook(() => useOnlineStatus());

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});

		it('should not update state after unmount', () => {
			const { result, unmount } = renderHook(() => useOnlineStatus());

			unmount();

			// Events after unmount should not cause state updates (no errors thrown)
			expect(() => {
				act(() => {
					window.dispatchEvent(new Event('offline'));
				});
			}).not.toThrow();
		});
	});

	// -----------------------------------------------------------------------
	// Multiple transitions
	// -----------------------------------------------------------------------
	describe('multiple transitions', () => {
		it('should handle rapid online/offline transitions', () => {
			const { result } = renderHook(() => useOnlineStatus());

			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			act(() => {
				window.dispatchEvent(new Event('online'));
			});
			act(() => {
				window.dispatchEvent(new Event('offline'));
			});
			act(() => {
				window.dispatchEvent(new Event('online'));
			});

			expect(result.current.isOnline).toBe(true);
			expect(result.current.wasOffline).toBe(true);
		});
	});
});

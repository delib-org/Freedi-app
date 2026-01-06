/**
 * Tests for useAutoClose hook
 */

import { renderHook, act } from '@testing-library/react';
import { useAutoClose } from '../useAutoClose';

describe('useAutoClose', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('initial state', () => {
		it('should return isOpen as false initially', () => {
			const { result } = renderHook(() => useAutoClose());

			expect(result.current.isOpen).toBe(false);
		});

		it('should return handleOpen function', () => {
			const { result } = renderHook(() => useAutoClose());

			expect(typeof result.current.handleOpen).toBe('function');
		});
	});

	describe('handleOpen', () => {
		it('should open when called and closed', () => {
			const { result } = renderHook(() => useAutoClose());

			act(() => {
				result.current.handleOpen();
			});

			expect(result.current.isOpen).toBe(true);
		});

		it('should close when called while open', () => {
			const { result } = renderHook(() => useAutoClose());

			// Open
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Close by calling again
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(false);
		});

		it('should toggle state on each call', () => {
			const { result } = renderHook(() => useAutoClose());

			// First call - open
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Second call - close
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(false);

			// Third call - open again
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);
		});
	});

	describe('auto close timer', () => {
		it('should auto-close after default delay (5000ms)', () => {
			const { result } = renderHook(() => useAutoClose());

			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Advance time by 4999ms - should still be open
			act(() => {
				jest.advanceTimersByTime(4999);
			});
			expect(result.current.isOpen).toBe(true);

			// Advance time by 1ms more - should close
			act(() => {
				jest.advanceTimersByTime(1);
			});
			expect(result.current.isOpen).toBe(false);
		});

		it('should auto-close after custom delay', () => {
			const { result } = renderHook(() => useAutoClose(2000));

			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Advance time by 2000ms
			act(() => {
				jest.advanceTimersByTime(2000);
			});
			expect(result.current.isOpen).toBe(false);
		});

		it('should clear timer when manually closed', () => {
			const { result } = renderHook(() => useAutoClose(5000));

			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Close manually before timer expires
			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(false);

			// Advance time past original timer - should not reopen
			act(() => {
				jest.advanceTimersByTime(5000);
			});
			expect(result.current.isOpen).toBe(false);
		});

		it('should reset timer when reopened', () => {
			const { result } = renderHook(() => useAutoClose(5000));

			act(() => {
				result.current.handleOpen();
			});

			// Advance time partially
			act(() => {
				jest.advanceTimersByTime(3000);
			});
			expect(result.current.isOpen).toBe(true);

			// Close and reopen
			act(() => {
				result.current.handleOpen(); // close
			});
			act(() => {
				result.current.handleOpen(); // reopen
			});
			expect(result.current.isOpen).toBe(true);

			// Original timer would have expired by now, but new timer is running
			act(() => {
				jest.advanceTimersByTime(3000);
			});
			expect(result.current.isOpen).toBe(true);

			// Wait for full new timer
			act(() => {
				jest.advanceTimersByTime(2000);
			});
			expect(result.current.isOpen).toBe(false);
		});
	});

	describe('cleanup', () => {
		it('should clear timeout on unmount', () => {
			const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
			const { result, unmount } = renderHook(() => useAutoClose());

			act(() => {
				result.current.handleOpen();
			});

			unmount();

			expect(clearTimeoutSpy).toHaveBeenCalled();
			clearTimeoutSpy.mockRestore();
		});
	});

	describe('edge cases', () => {
		it('should handle zero delay', () => {
			const { result } = renderHook(() => useAutoClose(0));

			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Should close immediately
			act(() => {
				jest.advanceTimersByTime(0);
			});
			expect(result.current.isOpen).toBe(false);
		});

		it('should handle very large delay', () => {
			const { result } = renderHook(() => useAutoClose(1000000));

			act(() => {
				result.current.handleOpen();
			});
			expect(result.current.isOpen).toBe(true);

			// Should still be open after 100 seconds
			act(() => {
				jest.advanceTimersByTime(100000);
			});
			expect(result.current.isOpen).toBe(true);
		});
	});
});

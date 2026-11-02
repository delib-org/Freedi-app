import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { UI } from '@/constants/common';
import { useCollapseState } from '../useCollapseState';

type EndEvent = React.SyntheticEvent<HTMLDivElement, TransitionEvent>;

const SETTLE_MS = UI.COLLAPSE_DURATION_MS + UI.COLLAPSE_FALLBACK_BUFFER_MS;

function setReducedMotion(reduced: boolean): void {
	(window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
		matches: reduced,
		media: query,
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
	}));
}

function endEvent(propertyName: string, bubbledFromChild = false): EndEvent {
	const currentTarget = document.createElement('div');
	const target = bubbledFromChild ? document.createElement('span') : currentTarget;

	return { target, currentTarget, nativeEvent: { propertyName } } as unknown as EndEvent;
}

function setup(initial: boolean) {
	return renderHook(({ open }) => useCollapseState(open), { initialProps: { open: initial } });
}

describe('useCollapseState', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		setReducedMotion(false);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('starts open or closed without a move', () => {
		expect(setup(true).result.current.phase).toBe('open');
		expect(setup(false).result.current.phase).toBe('closed');
	});

	it('opens: mounts at once, expands after the frames, settles on the timer', () => {
		const { result, rerender } = setup(false);

		rerender({ open: true });
		expect(result.current.phase).toBe('opening');
		expect(result.current.isMounted).toBe(true);
		expect(result.current.isExpanded).toBe(false);
		expect(result.current.isMoving).toBe(true);

		act(() => {
			jest.advanceTimersByTime(50);
		});
		expect(result.current.isExpanded).toBe(true);

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(result.current.phase).toBe('open');
		expect(result.current.isMoving).toBe(false);
	});

	it('closes: stays mounted and inert until the move ends, then unmounts', () => {
		const { result, rerender } = setup(true);

		rerender({ open: false });
		expect(result.current.phase).toBe('closing');
		expect(result.current.isMounted).toBe(true);
		expect(result.current.isInert).toBe(true);
		expect(result.current.isExpanded).toBe(false);

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(result.current.phase).toBe('closed');
		expect(result.current.isMounted).toBe(false);
		expect(result.current.isInert).toBe(false);
	});

	it('finishes on the height transitionend and ignores bubbled or other ones', () => {
		const { result, rerender } = setup(true);

		rerender({ open: false });
		act(() => result.current.onTransitionEnd(endEvent('grid-template-rows', true)));
		expect(result.current.phase).toBe('closing');

		act(() => result.current.onTransitionEnd(endEvent('opacity')));
		expect(result.current.phase).toBe('closing');

		act(() => result.current.onTransitionEnd(endEvent('grid-template-rows')));
		expect(result.current.phase).toBe('closed');
	});

	it('re-opening during the close reverses at once and keeps the children mounted', () => {
		const { result, rerender } = setup(true);

		rerender({ open: false });
		rerender({ open: true });
		expect(result.current.phase).toBe('opening');
		expect(result.current.isMounted).toBe(true);
		expect(result.current.isExpanded).toBe(true);
		expect(result.current.isInert).toBe(false);

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(result.current.phase).toBe('open');
	});

	it('closing during the open turns around before it expands', () => {
		const { result, rerender } = setup(false);

		rerender({ open: true });
		rerender({ open: false });
		expect(result.current.phase).toBe('closing');

		act(() => {
			jest.advanceTimersByTime(SETTLE_MS);
		});
		expect(result.current.phase).toBe('closed');
		expect(result.current.isExpanded).toBe(false);
	});

	it('is instant under reduced motion, with no timers', () => {
		setReducedMotion(true);
		const { result, rerender } = setup(false);

		rerender({ open: true });
		expect(result.current.phase).toBe('open');
		expect(result.current.isExpanded).toBe(true);

		rerender({ open: false });
		expect(result.current.phase).toBe('closed');
		expect(jest.getTimerCount()).toBe(0);
	});

	it('is instant when matchMedia does not exist', () => {
		const original = window.matchMedia;
		Object.defineProperty(window, 'matchMedia', { writable: true, value: undefined });

		try {
			const { result, rerender } = setup(true);

			rerender({ open: false });
			expect(result.current.phase).toBe('closed');
		} finally {
			Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
		}
	});
});

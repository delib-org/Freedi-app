import { renderHook } from '@testing-library/react';

import { useMarkDiscussionRead } from '../useMarkDiscussionRead';
import { updateLastReadTimestamp } from '@/controllers/db/subscriptions/setSubscriptions';
import { UI } from '@/constants/common';

jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	updateLastReadTimestamp: jest.fn().mockResolvedValue(undefined),
}));

const mockWrite = updateLastReadTimestamp as jest.MockedFunction<typeof updateLastReadTimestamp>;

interface HookProps {
	statementId?: string;
	userId?: string;
	isLoaded: boolean;
	lastChildUpdate?: number;
}

const base: HookProps = { statementId: 's1', userId: 'u1', isLoaded: true, lastChildUpdate: 100 };

const setVisibility = (state: 'visible' | 'hidden'): void => {
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
	document.dispatchEvent(new Event('visibilitychange'));
};

const render = (props: HookProps = base) =>
	renderHook((p: HookProps) => useMarkDiscussionRead(p), { initialProps: props });

describe('useMarkDiscussionRead', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1_000_000);
		mockWrite.mockClear();
		setVisibility('visible');
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it('writes exactly once when the discussion is opened', () => {
		render();

		expect(mockWrite).toHaveBeenCalledTimes(1);
		expect(mockWrite).toHaveBeenCalledWith('s1', 'u1');
	});

	it('does not write before the statement has loaded or without a user', () => {
		render({ ...base, isLoaded: false });
		render({ ...base, userId: undefined });

		expect(mockWrite).not.toHaveBeenCalled();
	});

	it('does not write when unrelated statement fields change', () => {
		const { rerender } = render();
		mockWrite.mockClear();

		// consensus / counts change -> same lastChildUpdate, new render
		for (let i = 0; i < 20; i++) rerender({ ...base });
		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS * 3);

		expect(mockWrite).not.toHaveBeenCalled();
	});

	it('writes again when switching to another discussion', () => {
		const { rerender } = render();
		rerender({ ...base, statementId: 's2' });

		expect(mockWrite).toHaveBeenCalledTimes(2);
		expect(mockWrite).toHaveBeenLastCalledWith('s2', 'u1');
	});

	it('limits a burst of new content within the window to leading + trailing', () => {
		const { rerender } = render();

		for (let i = 1; i <= 10; i++) {
			jest.advanceTimersByTime(1000);
			rerender({ ...base, lastChildUpdate: 100 + i });
		}
		expect(mockWrite).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS);

		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('writes immediately for new content once the window has passed', () => {
		const { rerender } = render();
		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS + 1);
		rerender({ ...base, lastChildUpdate: 200 });

		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('does not write while the tab is hidden, then catches up when visible', () => {
		setVisibility('hidden');
		const { rerender } = render();
		rerender({ ...base, lastChildUpdate: 200 });
		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS * 2);

		expect(mockWrite).not.toHaveBeenCalled();

		setVisibility('visible');

		expect(mockWrite).toHaveBeenCalledTimes(1);
	});

	it('skips the trailing write when the tab is hidden at that moment', () => {
		const { rerender } = render();
		rerender({ ...base, lastChildUpdate: 200 });
		setVisibility('hidden');
		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS);

		expect(mockWrite).toHaveBeenCalledTimes(1);

		setVisibility('visible');

		expect(mockWrite).toHaveBeenCalledTimes(2);
	});

	it('does not write after unmount', () => {
		const { rerender, unmount } = render();
		rerender({ ...base, lastChildUpdate: 200 });
		unmount();
		jest.advanceTimersByTime(UI.READ_MARK_THROTTLE_MS * 2);

		expect(mockWrite).toHaveBeenCalledTimes(1);
	});
});

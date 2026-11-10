import { act, renderHook, waitFor } from '@testing-library/react';
import { PARTICIPATION } from '@/constants/common';
import { getQuestionProgress } from '@/controllers/db/questionProgress/getQuestionProgress';
import { useQuestionProgress, useQuestionProgressRead } from '../useQuestionProgress';

jest.mock('@/controllers/db/questionProgress/getQuestionProgress', () => ({
	getQuestionProgress: jest.fn(),
}));

const mockGetProgress = getQuestionProgress as jest.Mock;
const START = 1_000_000;

describe('useQuestionProgress', () => {
	let now = START;

	beforeEach(() => {
		now = START;
		jest.spyOn(Date, 'now').mockImplementation(() => now);
		mockGetProgress.mockReset();
		mockGetProgress.mockResolvedValue({ suggested: 8, evaluated: 11 });
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('reads once on open', async () => {
		const { result } = renderHook(() => useQuestionProgress('open-q', '0'));

		await waitFor(() => expect(result.current).toEqual({ suggested: 8, evaluated: 11 }));
		expect(mockGetProgress).toHaveBeenCalledTimes(1);
		expect(mockGetProgress).toHaveBeenCalledWith('open-q');
	});

	it('says when the read is still on its way', async () => {
		const { result } = renderHook(() => useQuestionProgressRead('pending-q', '0'));

		expect(result.current).toMatchObject({ progress: null, isLoaded: false });
		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.progress).toEqual({ suggested: 8, evaluated: 11 });
	});

	it('counts as loaded when there is nothing to read', () => {
		const { result } = renderHook(() => useQuestionProgressRead(undefined, '0'));

		expect(result.current).toMatchObject({ progress: null, isLoaded: true });
	});

	it('skips the read without a question id', () => {
		renderHook(() => useQuestionProgress(undefined, '0'));

		expect(mockGetProgress).not.toHaveBeenCalled();
	});

	it('does not read again within the minute, even after an action', async () => {
		const { rerender } = renderHook(
			({ actionKey }) => useQuestionProgress('throttled-q', actionKey),
			{ initialProps: { actionKey: '0' } },
		);
		await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(1));

		now = START + PARTICIPATION.PROGRESS_REFRESH_MS - 1;
		rerender({ actionKey: '1' });

		expect(mockGetProgress).toHaveBeenCalledTimes(1);
	});

	it('reads again after an action once the minute has passed', async () => {
		const { rerender } = renderHook(
			({ actionKey }) => useQuestionProgress('refresh-q', actionKey),
			{ initialProps: { actionKey: '0' } },
		);
		await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(1));

		now = START + PARTICIPATION.PROGRESS_REFRESH_MS;
		rerender({ actionKey: '1' });

		await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(2));
	});

	it('shares one read between two surfaces on the same question', async () => {
		renderHook(() => useQuestionProgress('shared-q', '0'));
		const second = renderHook(() => useQuestionProgress('shared-q', '0'));

		await waitFor(() => expect(second.result.current).toEqual({ suggested: 8, evaluated: 11 }));
		expect(mockGetProgress).toHaveBeenCalledTimes(1);
	});

	it('reload drops the shared read and fetches again', async () => {
		const { result } = renderHook(() => useQuestionProgressRead('reload-q', '0'));
		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		act(() => result.current.reload());

		expect(result.current.isLoaded).toBe(false);
		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(mockGetProgress).toHaveBeenCalledTimes(2);
	});
});

describe('useQuestionProgressRead polling', () => {
	const MINUTE = PARTICIPATION.PROGRESS_REFRESH_MS;
	const always = () => true;
	let visibility: DocumentVisibilityState = 'visible';

	async function advance(ms: number): Promise<void> {
		await act(async () => {
			await jest.advanceTimersByTimeAsync(ms);
		});
	}

	async function setVisibility(next: DocumentVisibilityState): Promise<void> {
		visibility = next;
		await act(async () => {
			document.dispatchEvent(new Event('visibilitychange'));
		});
	}

	beforeEach(() => {
		jest.useFakeTimers();
		visibility = 'visible';
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => visibility,
		});
		mockGetProgress.mockReset();
		mockGetProgress.mockResolvedValue({ entered: 3 });
	});

	afterEach(() => {
		jest.useRealTimers();
		delete (document as unknown as { visibilityState?: string }).visibilityState;
	});

	it('never polls without being asked', async () => {
		renderHook(() => useQuestionProgressRead('quiet-q', '0'));
		await advance(MINUTE * 3);

		expect(mockGetProgress).toHaveBeenCalledTimes(1);
	});

	it('reads once a minute while polling', async () => {
		renderHook(() => useQuestionProgressRead('poll-q', '0', { pollWhile: always }));
		await advance(0);
		expect(mockGetProgress).toHaveBeenCalledTimes(1);

		await advance(MINUTE);
		expect(mockGetProgress).toHaveBeenCalledTimes(2);

		await advance(MINUTE);
		expect(mockGetProgress).toHaveBeenCalledTimes(3);
	});

	it('picks up a change the gate skipped when the minute is up', async () => {
		const { rerender } = renderHook(
			({ actionKey }) => useQuestionProgressRead('trail-q', actionKey, { pollWhile: always }),
			{ initialProps: { actionKey: '0' } },
		);
		await advance(MINUTE / 2);
		rerender({ actionKey: '1' });
		await advance(0);
		expect(mockGetProgress).toHaveBeenCalledTimes(1);

		await advance(MINUTE / 2);
		expect(mockGetProgress).toHaveBeenCalledTimes(2);
	});

	it('shares polled reads between two surfaces', async () => {
		renderHook(() => useQuestionProgressRead('two-q', '0', { pollWhile: always }));
		renderHook(() => useQuestionProgressRead('two-q', '0', { pollWhile: always }));
		await advance(0);
		await advance(MINUTE);

		expect(mockGetProgress).toHaveBeenCalledTimes(2);
	});

	it('pauses in a hidden tab and catches up when it returns', async () => {
		renderHook(() => useQuestionProgressRead('hidden-q', '0', { pollWhile: always }));
		await advance(0);

		await setVisibility('hidden');
		await advance(MINUTE * 5);
		expect(mockGetProgress).toHaveBeenCalledTimes(1);

		await setVisibility('visible');
		await advance(PARTICIPATION.PROGRESS_MIN_RETRY_MS);
		expect(mockGetProgress).toHaveBeenCalledTimes(2);
	});

	it('stops for good once the condition ends', async () => {
		mockGetProgress.mockResolvedValue({ entered: 500 });
		renderHook(() =>
			useQuestionProgressRead('stop-q', '0', {
				pollWhile: (progress) => (progress?.entered ?? 0) < 100,
			}),
		);
		await advance(MINUTE * 5);

		expect(mockGetProgress).toHaveBeenCalledTimes(1);
	});

	it('keeps checking after a read that found nothing', async () => {
		mockGetProgress.mockResolvedValue(null);
		renderHook(() =>
			useQuestionProgressRead('nothing-q', '0', {
				pollWhile: (progress) => (progress?.entered ?? 0) < 100,
			}),
		);
		await advance(0);
		await advance(MINUTE);

		expect(mockGetProgress).toHaveBeenCalledTimes(2);
	});

	it('clears its timer on unmount', async () => {
		const { unmount } = renderHook(() =>
			useQuestionProgressRead('unmount-q', '0', { pollWhile: always }),
		);
		await advance(0);
		unmount();
		await advance(MINUTE * 3);

		expect(mockGetProgress).toHaveBeenCalledTimes(1);
	});
});

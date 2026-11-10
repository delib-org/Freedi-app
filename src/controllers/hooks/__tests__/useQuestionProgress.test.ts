import { renderHook, waitFor } from '@testing-library/react';
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

		expect(result.current).toEqual({ progress: null, isLoaded: false });
		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.progress).toEqual({ suggested: 8, evaluated: 11 });
	});

	it('counts as loaded when there is nothing to read', () => {
		const { result } = renderHook(() => useQuestionProgressRead(undefined, '0'));

		expect(result.current).toEqual({ progress: null, isLoaded: true });
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
});

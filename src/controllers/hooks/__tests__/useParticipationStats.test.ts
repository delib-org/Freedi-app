import { act, renderHook, waitFor } from '@testing-library/react';
import { getCountFromServer, getDocs } from 'firebase/firestore';
import { Statement, StatementType } from '@freedi/shared-types';
import { getQuestionProgress } from '@/controllers/db/questionProgress/getQuestionProgress';
import { rebuildQuestionProgressOnce } from '@/controllers/db/questionProgress/rebuildQuestionProgress';
import { useParticipationStats } from '../useParticipationStats';

jest.mock('firebase/firestore', () => ({
	getDocs: jest.fn(),
	getCountFromServer: jest.fn(),
}));
jest.mock('@/controllers/db/questionProgress/getQuestionProgress', () => ({
	getQuestionProgress: jest.fn(),
}));
jest.mock('@/controllers/db/questionProgress/rebuildQuestionProgress', () => ({
	rebuildQuestionProgressOnce: jest.fn(),
}));

const mockGetProgress = getQuestionProgress as jest.Mock;
const mockRebuild = rebuildQuestionProgressOnce as jest.Mock;

const HEALTHY = { entered: 40, suggested: 12, evaluated: 30, options: 3 };
const BEFORE_COUNTERS = { entered: 1, suggested: 0, evaluated: 0, options: 0 };
const REBUILT = { entered: 320, suggested: 2, evaluated: 300, options: 3 };
const NO_OPTIONS: Statement[] = [];

function question(statementId: string, statementType = StatementType.question): Statement {
	return { statementId, statementType } as Statement;
}

function oldQuestion(statementId: string): Statement {
	return { ...question(statementId), totalEvaluators: 300 } as Statement;
}

describe('useParticipationStats', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetProgress.mockResolvedValue(HEALTHY);
		mockRebuild.mockResolvedValue(true);
	});

	it('downloads nothing and rebuilds nothing for a participant', () => {
		const { result } = renderHook(() =>
			useParticipationStats(oldQuestion('participant-q'), false, NO_OPTIONS),
		);

		expect(result.current).toBeNull();
		expect(getDocs).not.toHaveBeenCalled();
		expect(getCountFromServer).not.toHaveBeenCalled();
		expect(mockGetProgress).not.toHaveBeenCalled();
		expect(mockRebuild).not.toHaveBeenCalled();
	});

	it('gives a host the numbers from questionProgress without reading any rating', async () => {
		const { result } = renderHook(() =>
			useParticipationStats(question('host-q'), true, NO_OPTIONS),
		);

		await waitFor(() =>
			expect(result.current).toEqual({ entered: 40, suggested: 12, evaluated: 30 }),
		);
		expect(mockGetProgress).toHaveBeenCalledTimes(1);
		expect(mockGetProgress).toHaveBeenCalledWith('host-q');
		expect(mockRebuild).not.toHaveBeenCalled();
		expect(getDocs).not.toHaveBeenCalled();
		expect(getCountFromServer).not.toHaveBeenCalled();
	});

	it('never reports fewer entrants than people known to have taken part', async () => {
		mockGetProgress.mockResolvedValue({ ...HEALTHY, entered: 2, suggested: 9 });
		const { result } = renderHook(() =>
			useParticipationStats(question('early-q'), true, NO_OPTIONS),
		);

		await waitFor(() => expect(result.current?.entered).toBe(30));
	});

	it('is null, and rebuilds nothing, for a question with no counters and no activity', async () => {
		mockGetProgress.mockResolvedValue(null);
		const { result } = renderHook(() =>
			useParticipationStats(question('no-doc-q'), true, NO_OPTIONS),
		);

		await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(1));
		expect(result.current).toBeNull();
		expect(mockRebuild).not.toHaveBeenCalled();
	});

	it('hides old numbers during the rebuild, then shows the rebuilt ones', async () => {
		mockGetProgress.mockResolvedValueOnce(BEFORE_COUNTERS).mockResolvedValue(REBUILT);
		let finishRebuild: (succeeded: boolean) => void = () => undefined;
		mockRebuild.mockReturnValue(
			new Promise<boolean>((resolve) => {
				finishRebuild = resolve;
			}),
		);
		const { result } = renderHook(() =>
			useParticipationStats(oldQuestion('old-q'), true, NO_OPTIONS),
		);

		await waitFor(() => expect(mockRebuild).toHaveBeenCalledWith('old-q'));
		expect(result.current).toBeNull();

		await act(async () => finishRebuild(true));

		await waitFor(() => expect(result.current?.evaluated).toBe(300));
		expect(mockGetProgress).toHaveBeenCalledTimes(2);
		expect(mockRebuild).toHaveBeenCalledTimes(1);
	});

	it('rebuilds when the doc is missing but people have rated', async () => {
		mockGetProgress.mockResolvedValueOnce(null).mockResolvedValue(REBUILT);
		const { result } = renderHook(() =>
			useParticipationStats(oldQuestion('missing-q'), true, NO_OPTIONS),
		);

		await waitFor(() => expect(result.current?.evaluated).toBe(300));
		expect(mockRebuild).toHaveBeenCalledWith('missing-q');
	});

	it('keeps bad numbers hidden when the rebuild fails', async () => {
		mockGetProgress.mockResolvedValue(BEFORE_COUNTERS);
		mockRebuild.mockResolvedValue(false);
		const { result } = renderHook(() =>
			useParticipationStats(oldQuestion('denied-q'), true, NO_OPTIONS),
		);

		await waitFor(() => expect(mockRebuild).toHaveBeenCalledTimes(1));
		await act(async () => undefined);

		expect(result.current).toBeNull();
	});

	it('counts only genuine answers against the counters', async () => {
		const derived = [{ isCluster: true }, { isCluster: true }, { isCluster: true }];
		mockGetProgress.mockResolvedValue({ ...HEALTHY, options: 0 });
		const { result } = renderHook(() =>
			useParticipationStats(question('clusters-q'), true, derived as unknown as Statement[]),
		);

		await waitFor(() => expect(result.current).not.toBeNull());
		expect(mockRebuild).not.toHaveBeenCalled();
	});

	it('makes no read for a statement that is not a question', () => {
		renderHook(() =>
			useParticipationStats(question('space', StatementType.group), true, NO_OPTIONS),
		);

		expect(mockGetProgress).not.toHaveBeenCalled();
	});

	it('does not throw without a statement', () => {
		const { result } = renderHook(() => useParticipationStats(undefined, true, NO_OPTIONS));

		expect(result.current).toBeNull();
	});
});

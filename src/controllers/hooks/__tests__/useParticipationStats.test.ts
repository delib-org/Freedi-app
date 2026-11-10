import { renderHook, waitFor } from '@testing-library/react';
import { getCountFromServer, getDocs } from 'firebase/firestore';
import { Statement, StatementType } from '@freedi/shared-types';
import { getQuestionProgress } from '@/controllers/db/questionProgress/getQuestionProgress';
import { useParticipationStats } from '../useParticipationStats';

jest.mock('firebase/firestore', () => ({
	getDocs: jest.fn(),
	getCountFromServer: jest.fn(),
}));
jest.mock('@/controllers/db/questionProgress/getQuestionProgress', () => ({
	getQuestionProgress: jest.fn(),
}));

const mockGetProgress = getQuestionProgress as jest.Mock;

function question(statementId: string, statementType = StatementType.question): Statement {
	return { statementId, statementType } as Statement;
}

describe('useParticipationStats', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetProgress.mockResolvedValue({ entered: 40, suggested: 12, evaluated: 30 });
	});

	it('downloads nothing for a participant', () => {
		const { result } = renderHook(() =>
			useParticipationStats(question('participant-q'), false, 300),
		);

		expect(result.current).toBeNull();
		expect(getDocs).not.toHaveBeenCalled();
		expect(getCountFromServer).not.toHaveBeenCalled();
		expect(mockGetProgress).not.toHaveBeenCalled();
	});

	it('gives a host the numbers from questionProgress without reading any rating', async () => {
		const { result } = renderHook(() => useParticipationStats(question('host-q'), true, 3));

		await waitFor(() =>
			expect(result.current).toEqual({ entered: 40, suggested: 12, evaluated: 30 }),
		);
		expect(mockGetProgress).toHaveBeenCalledTimes(1);
		expect(mockGetProgress).toHaveBeenCalledWith('host-q');
		expect(getDocs).not.toHaveBeenCalled();
		expect(getCountFromServer).not.toHaveBeenCalled();
	});

	it('never reports fewer entrants than people known to have taken part', async () => {
		mockGetProgress.mockResolvedValue({ entered: 2, suggested: 9, evaluated: 30 });
		const { result } = renderHook(() => useParticipationStats(question('early-q'), true, 3));

		await waitFor(() => expect(result.current?.entered).toBe(30));
	});

	it('is null, not zeros, when a question has no counters', async () => {
		mockGetProgress.mockResolvedValue(null);
		const { result } = renderHook(() => useParticipationStats(question('no-doc-q'), true, 3));

		await waitFor(() => expect(mockGetProgress).toHaveBeenCalledTimes(1));
		expect(result.current).toBeNull();
	});

	it('makes no read for a statement that is not a question', () => {
		renderHook(() => useParticipationStats(question('space', StatementType.group), true, 0));

		expect(mockGetProgress).not.toHaveBeenCalled();
	});

	it('does not throw without a statement', () => {
		const { result } = renderHook(() => useParticipationStats(undefined, true, 0));

		expect(result.current).toBeNull();
	});
});

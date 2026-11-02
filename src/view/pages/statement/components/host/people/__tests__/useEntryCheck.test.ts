import { act, renderHook, waitFor } from '@testing-library/react';
import { getUserDemographicResponses } from '@/controllers/db/userDemographic/getUserDemographic';
import { saveMemberValidationStatus } from '@/controllers/db/memberValidation/memberValidationStatus';
import { UserDemographicQuestion } from '@freedi/shared-types';
import type { MemberReviewData } from '@/types/demographics';
import { useEntryCheck } from '../useEntryCheck';

jest.mock('@/controllers/db/userDemographic/getUserDemographic', () => ({
	getUserDemographicResponses: jest.fn(),
}));
jest.mock('@/controllers/db/memberValidation/memberValidationStatus', () => ({
	saveMemberValidationStatus: jest.fn(),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => ({ uid: 'host-1' }),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockedLoad = getUserDemographicResponses as jest.Mock;
const mockedSave = saveMemberValidationStatus as jest.Mock;

const pending = {
	userId: 'a',
	status: 'pending',
	responses: [],
	flags: [],
} as unknown as MemberReviewData;

describe('useEntryCheck', () => {
	beforeEach(() => jest.clearAllMocks());

	it('reads nothing when the space asks no questions', () => {
		renderHook(() => useEntryCheck('s1', false));

		expect(mockedLoad).not.toHaveBeenCalled();
	});

	it('loads the answers and counts them by status', async () => {
		mockedLoad.mockResolvedValue([pending]);
		const { result } = renderHook(() => useEntryCheck('s1', true));

		await waitFor(() => expect(result.current.counts.pending).toBe(1));
		expect(result.current.counts.all).toBe(1);
	});

	it('a decision is saved with the reviewer and updates the counts', async () => {
		mockedLoad.mockResolvedValue([pending]);
		mockedSave.mockResolvedValue(undefined);
		const { result } = renderHook(() => useEntryCheck('s1', true));
		await waitFor(() => expect(result.current.members).toHaveLength(1));

		await act(async () => result.current.decide('a', 'flag'));

		expect(mockedSave).toHaveBeenCalledWith('s1', 'a', 'flagged', undefined, 'host-1');
		expect(result.current.counts).toMatchObject({ pending: 0, flagged: 1 });
	});

	it('a failed save leaves the status as it was', async () => {
		mockedLoad.mockResolvedValue([pending]);
		mockedSave.mockRejectedValue(new Error('denied'));
		const { result } = renderHook(() => useEntryCheck('s1', true));
		await waitFor(() => expect(result.current.members).toHaveLength(1));

		await act(async () => result.current.decide('a', 'ban'));

		expect(result.current.counts.pending).toBe(1);
	});

	it('asks for the inherited group questions too, and reloads only when that set changes', async () => {
		mockedLoad.mockResolvedValue([pending]);
		const groupQuestion = { userQuestionId: 'gq1', statementId: 'g1' } as UserDemographicQuestion;
		const { result, rerender } = renderHook(
			({ inherited }) => useEntryCheck('s1', true, inherited),
			{ initialProps: { inherited: [groupQuestion] } },
		);
		await waitFor(() => expect(result.current.members).toHaveLength(1));

		expect(mockedLoad).toHaveBeenCalledWith('s1', [groupQuestion]);

		rerender({ inherited: [{ ...groupQuestion }] });
		expect(mockedLoad).toHaveBeenCalledTimes(1);
	});
});

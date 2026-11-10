import { renderHook, waitFor } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { setDoc } from 'firebase/firestore';
import { Statement, StatementType } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { createDocRef } from '@/utils/firebaseUtils';
import { useRecordQuestionView } from '../useRecordQuestionView';

jest.mock('react-redux', () => ({ useSelector: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	setDoc: jest.fn(),
	increment: jest.fn((value: number) => `increment:${value}`),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: jest.fn() }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({
	createDocRef: jest.fn((_collection: string, id: string) => ({ id })),
	getCurrentTimestamp: jest.fn(() => 1234),
}));

const mockSetDoc = setDoc as jest.Mock;
const mockUseSelector = useSelector as unknown as jest.Mock;

const question = {
	statementId: 'q1',
	topParentId: 'space1',
	statementType: StatementType.question,
} as Statement;

describe('useRecordQuestionView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSetDoc.mockResolvedValue(undefined);
		mockUseSelector.mockReturnValue({ uid: 'user1' });
	});

	it('records one view per user per question', () => {
		renderHook(() => useRecordQuestionView(question));

		expect(createDocRef).toHaveBeenCalledWith(expect.anything(), 'user1--q1');
		expect(mockSetDoc).toHaveBeenCalledTimes(1);
		expect(mockSetDoc).toHaveBeenCalledWith(
			{ id: 'user1--q1' },
			{
				statementId: 'q1',
				userId: 'user1',
				viewed: 'increment:1',
				lastViewed: 1234,
				parentDocumentId: 'space1',
			},
			{ merge: true },
		);
	});

	it('waits for a signed-in user', () => {
		mockUseSelector.mockReturnValue(undefined);
		renderHook(() => useRecordQuestionView(question));

		expect(mockSetDoc).not.toHaveBeenCalled();
	});

	it('records nothing for a statement that is not a question', () => {
		renderHook(() =>
			useRecordQuestionView({ ...question, statementType: StatementType.option } as Statement),
		);

		expect(mockSetDoc).not.toHaveBeenCalled();
	});

	it('logs a failed write with context', async () => {
		const failure = new Error('offline');
		mockSetDoc.mockRejectedValue(failure);
		renderHook(() => useRecordQuestionView(question));

		await waitFor(() =>
			expect(logError).toHaveBeenCalledWith(failure, {
				operation: 'useRecordQuestionView.recordView',
				userId: 'user1',
				statementId: 'q1',
			}),
		);
	});
});

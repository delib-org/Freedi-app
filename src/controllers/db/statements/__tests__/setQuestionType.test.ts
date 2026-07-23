import { QuestionType, StatementType } from '@freedi/shared-types';
import { setQuestionType } from '../setQuestionType';
import { getDoc, setDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';

jest.mock('firebase/firestore', () => ({
	getDoc: jest.fn(),
	setDoc: jest.fn(),
}));

jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: jest.fn((statementId: string) => ({ id: statementId })),
	getCurrentTimestamp: jest.fn(() => 1700000000000),
}));

jest.mock('@/utils/errorHandling', () => {
	const actual = jest.requireActual('@/utils/errorHandling');

	return {
		...actual,
		logError: jest.fn(),
	};
});

const mockGetDoc = getDoc as jest.Mock;
const mockSetDoc = setDoc as jest.Mock;
const mockLogError = logError as jest.Mock;

function mockStatementDoc(data: Record<string, unknown> | null): void {
	mockGetDoc.mockResolvedValue({
		exists: () => data !== null,
		data: () => data,
	});
}

describe('setQuestionType', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('marks a simple question as mass-consensus and reports the previous type', async () => {
		mockStatementDoc({
			statementType: StatementType.question,
			questionSettings: { questionType: QuestionType.simple },
		});

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result).toEqual({
			success: true,
			previousQuestionType: QuestionType.simple,
		});
		expect(mockSetDoc).toHaveBeenCalledWith(
			{ id: 'st-1' },
			{
				questionSettings: { questionType: QuestionType.massConsensus },
				lastUpdate: 1700000000000,
			},
			{ merge: true },
		);
	});

	it('defaults previousQuestionType to simple when questionSettings is absent', async () => {
		mockStatementDoc({ statementType: StatementType.question });

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result.previousQuestionType).toBe(QuestionType.simple);
	});

	it('is idempotent: no write when the type already matches', async () => {
		mockStatementDoc({
			statementType: StatementType.question,
			questionSettings: { questionType: QuestionType.massConsensus },
		});

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result).toEqual({
			success: true,
			previousQuestionType: QuestionType.massConsensus,
		});
		expect(mockSetDoc).not.toHaveBeenCalled();
	});

	it('supports Undo by restoring the previous type', async () => {
		mockStatementDoc({
			statementType: StatementType.question,
			questionSettings: { questionType: QuestionType.massConsensus },
		});

		const result = await setQuestionType('st-1', QuestionType.simple);

		expect(result.success).toBe(true);
		expect(mockSetDoc).toHaveBeenCalledWith(
			{ id: 'st-1' },
			{
				questionSettings: { questionType: QuestionType.simple },
				lastUpdate: 1700000000000,
			},
			{ merge: true },
		);
	});

	it('rejects non-question statements', async () => {
		mockStatementDoc({ statementType: StatementType.option });

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result.success).toBe(false);
		expect(mockSetDoc).not.toHaveBeenCalled();
		expect(mockLogError).toHaveBeenCalled();
	});

	it('fails on missing statement', async () => {
		mockStatementDoc(null);

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result.success).toBe(false);
		expect(mockLogError).toHaveBeenCalled();
	});

	it('fails on empty statementId without touching Firestore', async () => {
		const result = await setQuestionType('', QuestionType.massConsensus);

		expect(result.success).toBe(false);
		expect(mockGetDoc).not.toHaveBeenCalled();
	});

	it('returns failure when the write throws', async () => {
		mockStatementDoc({ statementType: StatementType.question });
		mockSetDoc.mockRejectedValueOnce(new Error('firestore down'));

		const result = await setQuestionType('st-1', QuestionType.massConsensus);

		expect(result.success).toBe(false);
		expect(mockLogError).toHaveBeenCalled();
	});
});

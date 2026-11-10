import { getDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { getQuestionProgress } from '../getQuestionProgress';

let mockParseSuccess = true;

jest.mock('valibot', () => ({
	...jest.requireActual('valibot'),
	safeParse: (_schema: unknown, input: unknown) => ({ success: mockParseSuccess, output: input }),
}));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({ createDocRef: jest.fn(() => 'ref') }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockGetDoc = getDoc as unknown as jest.Mock;

const validProgress = {
	statementId: 'q1',
	topParentId: 'q1',
	entered: 12,
	suggested: 6,
	evaluated: 9,
	options: 7,
	evaluations: 30,
	lastActivity: 1,
	lastUpdate: 1,
};

describe('getQuestionProgress', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockParseSuccess = true;
	});

	it('returns the parsed progress', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => true, data: () => validProgress });

		await expect(getQuestionProgress('q1')).resolves.toEqual(validProgress);
	});

	it('returns null when the question has no progress yet', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

		await expect(getQuestionProgress('q1')).resolves.toBeNull();
		expect(logError).not.toHaveBeenCalled();
	});

	it('logs and returns null for a malformed document', async () => {
		mockParseSuccess = false;
		mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ statementId: 'q1' }) });

		await expect(getQuestionProgress('q1')).resolves.toBeNull();
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('logs and returns null when the read fails', async () => {
		mockGetDoc.mockRejectedValue(new Error('denied'));

		await expect(getQuestionProgress('q1')).resolves.toBeNull();
		expect(logError).toHaveBeenCalledWith(expect.any(Error), {
			operation: 'questionProgress.getQuestionProgress',
			statementId: 'q1',
		});
	});
});

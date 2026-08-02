import { StatementType } from '@freedi/shared-types';
import { setIsDocument, toggleIsDocument } from '../setIsDocument';
import { getDoc, updateDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';

jest.mock('firebase/firestore', () => ({
	getDoc: jest.fn(),
	updateDoc: jest.fn(),
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
const mockUpdateDoc = updateDoc as jest.Mock;
const mockLogError = logError as jest.Mock;

function mockStatementDoc(data: Record<string, unknown> | null): void {
	mockGetDoc.mockResolvedValue({
		exists: () => data !== null,
		data: () => data,
	});
}

describe('setIsDocument', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('marks an option as a document', async () => {
		mockStatementDoc({ statementType: StatementType.option });

		const result = await setIsDocument('st-1', true);

		expect(result).toBe(true);
		expect(mockUpdateDoc).toHaveBeenCalledWith(
			{ id: 'st-1' },
			{ isDocument: true, lastUpdate: 1700000000000 },
		);
	});

	it('unmarks a document (Undo path)', async () => {
		mockStatementDoc({ statementType: StatementType.option, isDocument: true });

		const result = await setIsDocument('st-1', false);

		expect(result).toBe(true);
		expect(mockUpdateDoc).toHaveBeenCalledWith(
			{ id: 'st-1' },
			{ isDocument: false, lastUpdate: 1700000000000 },
		);
	});

	it('is idempotent: no write when the flag already matches', async () => {
		mockStatementDoc({ statementType: StatementType.option, isDocument: true });

		const result = await setIsDocument('st-1', true);

		expect(result).toBe(true);
		expect(mockUpdateDoc).not.toHaveBeenCalled();
	});

	it('rejects non-option statements', async () => {
		mockStatementDoc({ statementType: StatementType.question });

		const result = await setIsDocument('st-1', true);

		expect(result).toBe(false);
		expect(mockUpdateDoc).not.toHaveBeenCalled();
		expect(mockLogError).toHaveBeenCalled();
	});

	it('fails on missing statement', async () => {
		mockStatementDoc(null);

		const result = await setIsDocument('st-1', true);

		expect(result).toBe(false);
		expect(mockLogError).toHaveBeenCalled();
	});

	it('fails on empty statementId without touching Firestore', async () => {
		const result = await setIsDocument('', true);

		expect(result).toBe(false);
		expect(mockGetDoc).not.toHaveBeenCalled();
		expect(mockLogError).toHaveBeenCalled();
	});

	it('returns false when the write throws', async () => {
		mockStatementDoc({ statementType: StatementType.option });
		mockUpdateDoc.mockRejectedValueOnce(new Error('firestore down'));

		const result = await setIsDocument('st-1', true);

		expect(result).toBe(false);
		expect(mockLogError).toHaveBeenCalled();
	});
});

describe('toggleIsDocument (legacy row, unchanged behavior)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('flips the flag on an option', async () => {
		mockStatementDoc({ statementType: StatementType.option, isDocument: true });

		const result = await toggleIsDocument('st-1');

		expect(result).toBe(false);
		expect(mockUpdateDoc).toHaveBeenCalledWith(
			{ id: 'st-1' },
			{ isDocument: false, lastUpdate: 1700000000000 },
		);
	});
});

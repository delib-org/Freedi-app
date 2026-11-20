import { Statement } from '@freedi/shared-types';
import { deleteField, updateDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { removeStatementMainImage, updateStatementMainImage } from '../updateStatementFields';

const DELETE_SENTINEL = { __sentinel: 'deleteField' };

jest.mock('firebase/firestore', () => ({
	getDoc: jest.fn(),
	updateDoc: jest.fn(),
	runTransaction: jest.fn(),
	deleteField: jest.fn(() => ({ __sentinel: 'deleteField' })),
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

jest.mock('../setStatements', () => ({
	resultsSettingsDefault: {},
}));

jest.mock('../../config', () => ({ FireStore: {} }));

const mockUpdateDoc = updateDoc as jest.Mock;
const mockDeleteField = deleteField as jest.Mock;
const mockLogError = logError as jest.Mock;

const statement = { statementId: 'st1' } as Statement;

describe('removeStatementMainImage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdateDoc.mockResolvedValue(undefined);
	});

	it('deletes imagesURL.main and the thumbnail fields, and does not log an error', async () => {
		await removeStatementMainImage(statement);

		expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
		const [ref, data] = mockUpdateDoc.mock.calls[0];
		expect(ref).toEqual({ id: 'st1' });
		expect(data).toEqual({
			'imagesURL.main': DELETE_SENTINEL,
			'imagesURL.thumb': DELETE_SENTINEL,
			'imagesURL.thumbOf': DELETE_SENTINEL,
			'imagesURL.thumbWidth': DELETE_SENTINEL,
			'imagesURL.mainWidth': DELETE_SENTINEL,
			'imagesURL.alt': DELETE_SENTINEL,
		});
		expect(mockDeleteField).toHaveBeenCalled();
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('leaves displayMode untouched', async () => {
		await removeStatementMainImage(statement);

		const data = mockUpdateDoc.mock.calls[0][1] as Record<string, unknown>;
		expect(Object.keys(data)).not.toContain('imagesURL.displayMode');
		expect(Object.keys(data)).not.toContain('imagesURL');
	});

	it('logs with context when the write fails', async () => {
		mockUpdateDoc.mockRejectedValue(new Error('offline'));

		await removeStatementMainImage(statement);

		expect(mockLogError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'statements.updateStatementFields.removeStatementMainImage',
				statementId: 'st1',
			}),
		);
	});
});

describe('updateStatementMainImage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUpdateDoc.mockResolvedValue(undefined);
	});

	it('writes a real URL', async () => {
		await updateStatementMainImage(statement, 'https://img/a.png');

		expect(mockUpdateDoc).toHaveBeenCalledWith(
			{ id: 'st1' },
			{ 'imagesURL.main': 'https://img/a.png' },
		);
	});

	it('refuses an empty URL without writing', async () => {
		await updateStatementMainImage(statement, '');

		expect(mockUpdateDoc).not.toHaveBeenCalled();
		expect(mockLogError).toHaveBeenCalled();
	});
});

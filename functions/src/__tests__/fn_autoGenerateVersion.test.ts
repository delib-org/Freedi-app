import { getFirestore } from 'firebase-admin/firestore';
import { onSuggestionCreatedAutoGenerate } from '../fn_autoGenerateVersion';

// Get the mock firestore from the global jest setup
const mockDb = getFirestore();

describe('fn_autoGenerateVersion', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should skip if event data is undefined', async () => {
		const event = {
			data: undefined,
		} as Parameters<typeof onSuggestionCreatedAutoGenerate>[0];

		await onSuggestionCreatedAutoGenerate(event);

		// Should not have queried firestore at all
		expect(mockDb.collection).not.toHaveBeenCalled();
	});

	it('should skip if suggestion has no parentId', async () => {
		const event = {
			data: {
				data: () => ({ content: 'test suggestion' }),
				id: 'suggestion1',
			},
		} as unknown as Parameters<typeof onSuggestionCreatedAutoGenerate>[0];

		await onSuggestionCreatedAutoGenerate(event);

		// Should query for parent but parentId is undefined, so it returns early
		// The collection('statements') would be called to look up parentId
		// but since parentId is falsy, it returns before querying settings
	});

	it('should skip if parent statement does not exist', async () => {
		const event = {
			data: {
				data: () => ({ parentId: 'parent1' }),
				id: 'suggestion1',
			},
		} as unknown as Parameters<typeof onSuggestionCreatedAutoGenerate>[0];

		// The default mock returns { exists: false } for doc.get()
		// so the parent lookup will fail and the function should return early

		await onSuggestionCreatedAutoGenerate(event);

		// Should have tried to look up the parent
		expect(mockDb.collection).toHaveBeenCalledWith('statements');
	});

	it('should handle errors gracefully without throwing', async () => {
		const event = {
			data: {
				data: () => {
					throw new Error('Unexpected error');
				},
				id: 'suggestion1',
			},
		} as unknown as Parameters<typeof onSuggestionCreatedAutoGenerate>[0];

		// Should not throw - errors are caught and logged
		await expect(
			onSuggestionCreatedAutoGenerate(event),
		).resolves.not.toThrow();
	});
});

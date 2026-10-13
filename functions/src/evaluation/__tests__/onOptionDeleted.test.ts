import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';

let mockParent: Record<string, unknown> | null = null;
jest.mock('../../index', () => ({
	db: {
		collection: () => ({
			doc: () => ({
				get: async () => ({ exists: mockParent !== null, data: () => mockParent }),
			}),
		}),
	},
}));
jest.mock('firebase-functions/v1', () => ({ logger: { info: jest.fn() } }));

const mockRecompute = jest.fn<(parentId: string | undefined) => Promise<void>>();
jest.mock('../updateChosenOptions', () => ({
	updateParentStatementWithChosenOptions: (parentId: string | undefined) => mockRecompute(parentId),
}));

import { recomputeResultsOnOptionDeleted } from '../onOptionDeleted';

function deletedEvent(
	statement: Record<string, unknown> | undefined,
): FirestoreEvent<DocumentSnapshot | undefined> {
	const data = statement ? ({ data: () => statement } as unknown as DocumentSnapshot) : undefined;

	return { data } as unknown as FirestoreEvent<DocumentSnapshot | undefined>;
}

const option = { statementId: 'opt1', parentId: 'q1', statementType: 'option' };

describe('recomputeResultsOnOptionDeleted', () => {
	beforeEach(() => {
		mockRecompute.mockReset();
		mockParent = { statementId: 'q1', results: [] };
	});

	it('recomputes when the deleted option is cached in the parent results', async () => {
		mockParent = { statementId: 'q1', results: [{ statementId: 'opt1' }] };
		await recomputeResultsOnOptionDeleted(deletedEvent(option));
		expect(mockRecompute).toHaveBeenCalledWith('q1');
	});

	it('recomputes when the deleted option was marked chosen', async () => {
		await recomputeResultsOnOptionDeleted(deletedEvent({ ...option, isChosen: true }));
		expect(mockRecompute).toHaveBeenCalledWith('q1');
	});

	it('skips an option that was not a top answer', async () => {
		mockParent = { statementId: 'q1', results: [{ statementId: 'other' }] };
		await recomputeResultsOnOptionDeleted(deletedEvent(option));
		expect(mockRecompute).not.toHaveBeenCalled();
	});

	it('skips non-option statements', async () => {
		await recomputeResultsOnOptionDeleted(
			deletedEvent({ ...option, statementType: 'question', isChosen: true }),
		);
		expect(mockRecompute).not.toHaveBeenCalled();
	});

	it('skips when the parent is gone too', async () => {
		mockParent = null;
		await recomputeResultsOnOptionDeleted(deletedEvent({ ...option, isChosen: true }));
		expect(mockRecompute).not.toHaveBeenCalled();
	});

	it('skips an event without data', async () => {
		await recomputeResultsOnOptionDeleted(deletedEvent(undefined));
		expect(mockRecompute).not.toHaveBeenCalled();
	});
});

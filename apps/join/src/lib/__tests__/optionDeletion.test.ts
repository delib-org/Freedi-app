import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Statement } from '@freedi/shared-types';

// Mock firebase BEFORE importing the SUT — optionDeletion imports
// db/collection/doc/getDocs/query/where/writeBatch at module load.
const mockGetDocs = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock('../firebase', () => ({
	db: {},
	collection: vi.fn(() => ({ _collection: 'statements' })),
	doc: vi.fn((_db: unknown, _col: string, id: string) => ({ _id: id })),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	query: vi.fn((...parts: unknown[]) => ({ _query: parts })),
	where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
	writeBatch: vi.fn(() => ({
		delete: (...args: unknown[]) => mockBatchDelete(...args),
		commit: () => mockBatchCommit(),
	})),
}));

const mockIsAdmin = vi.fn(() => true);
const mockCanEditOption = vi.fn(() => true);

vi.mock('../admin', () => ({
	isAdmin: () => mockIsAdmin(),
	canEditOption: () => mockCanEditOption(),
}));

// Import the SUT after mocks are wired.
import { deleteOption, deleteAllOptions } from '../optionDeletion';

/** Shape the code actually touches — `id` on the snapshot docs. */
function snapOf(ids: string[]): { docs: { id: string }[]; size: number } {
	return { docs: ids.map((id) => ({ id })), size: ids.length };
}

/** Minimal Statement stub — only `statementId` is read by deleteOption. */
function optionStub(statementId: string): Statement {
	return { statementId } as Statement;
}

/** Ids passed to batch.delete across every batch, in call order. */
function deletedIds(): string[] {
	return mockBatchDelete.mock.calls.map((call) => (call[0] as { _id: string })._id);
}

beforeEach(() => {
	mockGetDocs.mockReset();
	mockBatchDelete.mockReset();
	mockBatchCommit.mockReset();
	mockBatchCommit.mockResolvedValue(undefined);
	mockIsAdmin.mockReturnValue(true);
	mockCanEditOption.mockReturnValue(true);
});

describe('deleteOption', () => {
	it('deletes the option and both descendant levels', async () => {
		// 1st getDocs: children of the option (a paragraph + a chat message).
		// 2nd getDocs: children of those (the chat message's paragraph).
		mockGetDocs
			.mockResolvedValueOnce(snapOf(['para-1', 'chat-1']))
			.mockResolvedValueOnce(snapOf(['chat-1-para']));

		await deleteOption(optionStub('opt-1'));

		expect(deletedIds()).toEqual(['para-1', 'chat-1', 'chat-1-para', 'opt-1']);
		expect(mockBatchCommit).toHaveBeenCalledTimes(1);
	});

	it('deletes a childless option without extra writes', async () => {
		mockGetDocs.mockResolvedValueOnce(snapOf([])).mockResolvedValueOnce(snapOf([]));

		await deleteOption(optionStub('opt-lonely'));

		expect(deletedIds()).toEqual(['opt-lonely']);
	});

	it('skips the second-level query when there are no children', async () => {
		mockGetDocs.mockResolvedValueOnce(snapOf([]));

		await deleteOption(optionStub('opt-lonely'));

		// findChildIds([]) short-circuits, so only the level-1 read happens.
		expect(mockGetDocs).toHaveBeenCalledTimes(1);
	});

	it('throws and writes nothing when the user is not authorized', async () => {
		mockCanEditOption.mockReturnValue(false);

		await expect(deleteOption(optionStub('opt-1'))).rejects.toThrow('Not authorized');
		expect(mockGetDocs).not.toHaveBeenCalled();
		expect(mockBatchDelete).not.toHaveBeenCalled();
	});
});

describe('deleteAllOptions', () => {
	it('deletes every option under the question plus descendants', async () => {
		mockGetDocs
			.mockResolvedValueOnce(snapOf(['opt-1', 'opt-2'])) // options
			.mockResolvedValueOnce(snapOf(['chat-1'])) // level 1
			.mockResolvedValueOnce(snapOf(['chat-1-para'])); // level 2

		const result = await deleteAllOptions('q1');

		expect(result).toEqual({ optionsDeleted: 2, descendantsDeleted: 2, errors: [] });
		expect(deletedIds()).toEqual(['chat-1', 'chat-1-para', 'opt-1', 'opt-2']);
	});

	it('is a no-op on a question with no options', async () => {
		mockGetDocs.mockResolvedValueOnce(snapOf([]));

		const result = await deleteAllOptions('q1');

		expect(result).toEqual({ optionsDeleted: 0, descendantsDeleted: 0, errors: [] });
		expect(mockBatchDelete).not.toHaveBeenCalled();
	});

	it('refuses for non-admins', async () => {
		mockIsAdmin.mockReturnValue(false);

		const result = await deleteAllOptions('q1');

		expect(result.errors).toEqual(['not_admin']);
		expect(mockGetDocs).not.toHaveBeenCalled();
	});

	it('reports a read failure without deleting anything', async () => {
		mockGetDocs.mockRejectedValueOnce(new Error('permission-denied'));

		const result = await deleteAllOptions('q1');

		expect(result.errors).toEqual(['read']);
		expect(mockBatchDelete).not.toHaveBeenCalled();
	});

	it('still deletes the options when the descendant read fails', async () => {
		mockGetDocs
			.mockResolvedValueOnce(snapOf(['opt-1']))
			.mockRejectedValueOnce(new Error('permission-denied'));

		const result = await deleteAllOptions('q1');

		expect(result.errors).toEqual(['descendants']);
		expect(result.optionsDeleted).toBe(1);
		expect(deletedIds()).toEqual(['opt-1']);
	});

	it('reports a delete failure', async () => {
		mockGetDocs
			.mockResolvedValueOnce(snapOf(['opt-1']))
			.mockResolvedValueOnce(snapOf([]))
			.mockResolvedValueOnce(snapOf([]));
		mockBatchCommit.mockRejectedValueOnce(new Error('permission-denied'));

		const result = await deleteAllOptions('q1');

		expect(result.errors).toEqual(['delete']);
		expect(result.optionsDeleted).toBe(0);
	});

	it('chunks parent-id reads into `in` queries of 30', async () => {
		const manyOptions = Array.from({ length: 65 }, (_, i) => `opt-${i}`);
		mockGetDocs
			.mockResolvedValueOnce(snapOf(manyOptions)) // options query
			.mockResolvedValue(snapOf([])); // every chunked child query

		await deleteAllOptions('q1');

		// 1 options read + ceil(65/30)=3 level-1 reads. Level 2 short-circuits
		// because level 1 came back empty.
		expect(mockGetDocs).toHaveBeenCalledTimes(4);
	});

	it('splits deletes into batches of 500', async () => {
		const manyOptions = Array.from({ length: 520 }, (_, i) => `opt-${i}`);
		mockGetDocs.mockResolvedValueOnce(snapOf(manyOptions)).mockResolvedValue(snapOf([]));

		const result = await deleteAllOptions('q1');

		expect(result.optionsDeleted).toBe(520);
		expect(mockBatchDelete).toHaveBeenCalledTimes(520);
		expect(mockBatchCommit).toHaveBeenCalledTimes(2);
	});
});

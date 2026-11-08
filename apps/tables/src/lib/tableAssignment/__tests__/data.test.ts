import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
	collection: vi.fn((_db: unknown, name: string) => ({ name })),
	doc: vi.fn(),
	getDocs: vi.fn(),
	query: vi.fn((...parts: unknown[]) => parts),
	where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/listeners', () => ({ resilientDoc: vi.fn(), resilientQuery: vi.fn() }));

import { fetchChosenOptions } from '../data';

describe('fetchChosenOptions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('filters the question children by the isChosen flag the server writes', async () => {
		firestore.getDocs.mockResolvedValue({ docs: [] });

		await fetchChosenOptions('question-1');

		expect(firestore.where).toHaveBeenCalledWith('parentId', '==', 'question-1');
		expect(firestore.where).toHaveBeenCalledWith('isChosen', '==', true);
		expect(firestore.where).toHaveBeenCalledTimes(2);
	});

	it('returns the statement data of every matching document', async () => {
		const option = { statementId: 'option-1', isChosen: true };
		firestore.getDocs.mockResolvedValue({ docs: [{ data: () => option }] });

		await expect(fetchChosenOptions('question-1')).resolves.toEqual([option]);
	});

	it('rejects when the read is not permitted', async () => {
		firestore.getDocs.mockRejectedValue(new Error('permission-denied'));

		await expect(fetchChosenOptions('question-1')).rejects.toThrow('permission-denied');
	});
});

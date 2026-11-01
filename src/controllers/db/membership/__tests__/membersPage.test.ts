jest.mock('firebase/firestore', () => ({
	getCountFromServer: jest.fn(),
	getDocs: jest.fn(),
	limit: jest.fn((n: number) => ({ type: 'limit', n })),
	orderBy: jest.fn((field: string, dir: string) => ({ type: 'orderBy', field, dir })),
	query: jest.fn((...parts: unknown[]) => ({ parts })),
	startAfter: jest.fn((value: unknown) => ({ type: 'startAfter', value })),
	where: jest.fn((field: string, op: string, value: unknown) => ({
		type: 'where',
		field,
		op,
		value,
	})),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createCollectionRef: jest.fn(() => ({ type: 'collection' })),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setMembership: jest.fn((payload: unknown) => ({ type: 'statements/setMembership', payload })),
}));
jest.mock('@/utils/errorHandling', () => {
	const actual = jest.requireActual('@/utils/errorHandling');

	return { ...actual, logError: jest.fn() };
});

import { getCountFromServer, getDocs, limit, startAfter } from 'firebase/firestore';
import { FIREBASE } from '@/constants/common';
import { DatabaseError, logError } from '@/utils/errorHandling';
import { countMembers, loadMembersPage } from '../membersPage';

const mockedCount = getCountFromServer as jest.Mock;
const mockedGetDocs = getDocs as jest.Mock;

describe('membersPage', () => {
	beforeEach(() => jest.clearAllMocks());

	describe('countMembers', () => {
		it('returns the aggregation count', async () => {
			mockedCount.mockResolvedValue({ data: () => ({ count: 140 }) });

			await expect(countMembers('s1')).resolves.toBe(140);
		});

		it('logs and throws DatabaseError when the count fails', async () => {
			mockedCount.mockRejectedValue(new Error('offline'));

			await expect(countMembers('s1')).rejects.toBeInstanceOf(DatabaseError);
			expect(logError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({ statementId: 's1' }),
			);
		});
	});

	describe('loadMembersPage', () => {
		it('reads the page after the cursor into Redux and returns its size', async () => {
			const docs = [{ data: () => ({ statementsSubscribeId: 'a' }) }];
			mockedGetDocs.mockResolvedValue({ docs, size: docs.length });
			const dispatch = jest.fn();

			const arrived = await loadMembersPage(dispatch)({ statementId: 's1', afterCreatedAt: 99 });

			expect(arrived).toBe(1);
			expect(startAfter).toHaveBeenCalledWith(99);
			expect(limit).toHaveBeenCalledWith(FIREBASE.QUERY_LIMIT_DEFAULT);
			expect(dispatch).toHaveBeenCalledWith({
				type: 'statements/setMembership',
				payload: { statementsSubscribeId: 'a' },
			});
		});

		it('throws DatabaseError when the read fails', async () => {
			mockedGetDocs.mockRejectedValue(new Error('denied'));

			await expect(
				loadMembersPage(jest.fn())({ statementId: 's1', afterCreatedAt: 1, pageSize: 5 }),
			).rejects.toBeInstanceOf(DatabaseError);
		});
	});
});

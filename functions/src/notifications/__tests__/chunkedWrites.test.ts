import type { Firestore } from 'firebase-admin/firestore';

const mockLogError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import {
	CHUNK_COMMIT_MAX_ATTEMPTS,
	FIRESTORE_BATCH_WRITE_LIMIT,
	commitWritesInChunks,
	type PendingWrite,
} from '../chunkedWrites';

interface FakeBatch {
	ids: string[];
}

function fakeDb(shouldFail: (batch: FakeBatch, attempt: number) => boolean = () => false): {
	db: Firestore;
	attempts: FakeBatch[];
	landed: FakeBatch[];
} {
	const attempts: FakeBatch[] = [];
	const landed: FakeBatch[] = [];
	const db = {
		batch: () => {
			const batch: FakeBatch = { ids: [] };

			return {
				set: (ref: { id: string }) => batch.ids.push(ref.id),
				commit: async () => {
					attempts.push(batch);
					if (shouldFail(batch, attempts.length)) throw new Error('commit failed');
					landed.push(batch);
				},
			};
		},
	} as unknown as Firestore;

	return { db, attempts, landed };
}

function writes(count: number): PendingWrite[] {
	return Array.from(
		{ length: count },
		(_, i) => ({ ref: { id: `doc-${i}` }, data: { i } }) as unknown as PendingWrite,
	);
}

const context = { operation: 'test.commit', statementId: 's1', parentId: 'p1' };

describe('commitWritesInChunks', () => {
	beforeEach(() => mockLogError.mockClear());

	it.each([
		[0, []],
		[499, [499]],
		[500, [500]],
		[501, [500, 1]],
		[1116, [500, 500, 116]],
	])('splits %i writes into chunks %j', async (count, expected) => {
		const { db, landed } = fakeDb();

		const result = await commitWritesInChunks(db, writes(count), context);

		expect(landed.map((batch) => batch.ids.length)).toEqual(expected);
		expect(result).toEqual({ chunks: expected.length, committed: count, failed: 0 });
	});

	it('never builds a batch above the Firestore limit', async () => {
		const { db, attempts } = fakeDb();

		await commitWritesInChunks(db, writes(2345), context);

		expect(Math.max(...attempts.map((batch) => batch.ids.length))).toBe(
			FIRESTORE_BATCH_WRITE_LIMIT,
		);
	});

	it('retries a chunk that fails once and logs nothing', async () => {
		const { db, attempts, landed } = fakeDb((_batch, attempt) => attempt === 1);

		const result = await commitWritesInChunks(db, writes(10), context);

		expect(attempts).toHaveLength(2);
		expect(landed).toHaveLength(1);
		expect(result.failed).toBe(0);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('logs a chunk that keeps failing and still lands every other chunk once', async () => {
		const { db, attempts, landed } = fakeDb((batch) => batch.ids[0] === 'doc-500');

		const result = await commitWritesInChunks(db, writes(1116), context);

		expect(result).toEqual({ chunks: 3, committed: 616, failed: 500 });
		expect(attempts.filter((batch) => batch.ids[0] === 'doc-500')).toHaveLength(
			CHUNK_COMMIT_MAX_ATTEMPTS,
		);
		const landedIds = landed.flatMap((batch) => batch.ids);
		expect(new Set(landedIds).size).toBe(landedIds.length);
		expect(landedIds).toHaveLength(616);
		expect(mockLogError).toHaveBeenCalledTimes(1);
		expect(mockLogError.mock.calls[0][1]).toMatchObject({
			operation: 'test.commit',
			statementId: 's1',
			metadata: { parentId: 'p1', chunkIndex: 1, writesLost: 500 },
		});
	});
});

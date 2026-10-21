import { describe, it, expect, jest } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: {
		arrayRemove: (...values: string[]) => ({ __arrayRemove: values }),
	},
}));

import {
	ARRAY_CONTAINS_ANY_MAX_VALUES,
	SUBSCRIPTION_TOKEN_BATCH_SIZE,
	removeTokensFromUserSubscriptions,
} from '../removeSubscriptionTokens';

interface FakeDoc {
	ref: { path: string };
}

interface BatchRecord {
	updates: Array<{ path: string; data: Record<string, unknown> }>;
	committed: boolean;
}

interface Harness {
	db: Firestore;
	queries: Array<{ filters: Array<[string, string, unknown]>; limit?: number }>;
	batches: BatchRecord[];
}

/** Fake Firestore: `pages` are the snapshots returned by successive queries. */
function createHarness(pages: FakeDoc[][]): Harness {
	const queries: Harness['queries'] = [];
	const batches: BatchRecord[] = [];
	let call = 0;

	const makeQuery = (filters: Array<[string, string, unknown]>, limit?: number) => ({
		where: (field: string, op: string, value: unknown) =>
			makeQuery([...filters, [field, op, value]], limit),
		limit: (n: number) => makeQuery(filters, n),
		get: async () => {
			queries.push({ filters, limit });
			const docs = pages[call++] ?? [];

			return { docs, size: docs.length, empty: docs.length === 0 };
		},
	});

	const db = {
		collection: () => makeQuery([]),
		batch: () => {
			const record: BatchRecord = { updates: [], committed: false };
			batches.push(record);

			return {
				update: (ref: { path: string }, data: Record<string, unknown>) => {
					record.updates.push({ path: ref.path, data });
				},
				commit: async () => {
					record.committed = true;
				},
			};
		},
	} as unknown as Firestore;

	return { db, queries, batches };
}

const makeDocs = (count: number, prefix = 'sub'): FakeDoc[] =>
	Array.from({ length: count }, (_, i) => ({ ref: { path: `statementsSubscribe/${prefix}${i}` } }));

describe('removeTokensFromUserSubscriptions', () => {
	it('queries only the user docs containing the token and writes arrayRemove without lastUpdate', async () => {
		const h = createHarness([makeDocs(2)]);

		const count = await removeTokensFromUserSubscriptions(h.db, 'u1', ['dead']);

		expect(count).toBe(2);
		expect(h.queries).toHaveLength(1);
		expect(h.queries[0].filters).toEqual([
			['userId', '==', 'u1'],
			['tokens', 'array-contains-any', ['dead']],
		]);
		expect(h.batches).toHaveLength(1);
		for (const update of h.batches[0].updates) {
			expect(Object.keys(update.data)).toEqual(['tokens']);
			expect(update.data).not.toHaveProperty('lastUpdate');
			expect(update.data.tokens).toEqual({ __arrayRemove: ['dead'] });
		}
	});

	it('does nothing when no subscription contains the token', async () => {
		const h = createHarness([[]]);

		const count = await removeTokensFromUserSubscriptions(h.db, 'u1', ['dead']);

		expect(count).toBe(0);
		expect(h.batches).toHaveLength(0);
	});

	it('chunks more than 30 tokens across queries', async () => {
		const tokens = Array.from({ length: ARRAY_CONTAINS_ANY_MAX_VALUES * 2 + 5 }, (_, i) => `t${i}`);
		const h = createHarness([[], [], []]);

		await removeTokensFromUserSubscriptions(h.db, 'u1', tokens);

		expect(h.queries).toHaveLength(3);
		const sizes = h.queries.map((q) => (q.filters[1][2] as string[]).length);
		expect(sizes).toEqual([ARRAY_CONTAINS_ANY_MAX_VALUES, ARRAY_CONTAINS_ANY_MAX_VALUES, 5]);
	});

	it('removes every token from a doc, and does not rewrite a doc matched by two chunks', async () => {
		const tokens = Array.from({ length: ARRAY_CONTAINS_ANY_MAX_VALUES + 1 }, (_, i) => `t${i}`);
		const shared = makeDocs(1, 'shared');
		const h = createHarness([shared, shared]);

		const count = await removeTokensFromUserSubscriptions(h.db, 'u1', tokens);

		expect(count).toBe(1);
		expect(h.batches).toHaveLength(1);
		expect(h.batches[0].updates[0].data.tokens).toEqual({ __arrayRemove: tokens });
	});

	it('commits more than the batch size in multiple batches', async () => {
		const h = createHarness([
			makeDocs(SUBSCRIPTION_TOKEN_BATCH_SIZE, 'a'),
			makeDocs(SUBSCRIPTION_TOKEN_BATCH_SIZE, 'b'),
			makeDocs(3, 'c'),
		]);

		const count = await removeTokensFromUserSubscriptions(h.db, 'u1', ['dead']);

		expect(count).toBe(SUBSCRIPTION_TOKEN_BATCH_SIZE * 2 + 3);
		expect(h.batches.map((b) => b.updates.length)).toEqual([
			SUBSCRIPTION_TOKEN_BATCH_SIZE,
			SUBSCRIPTION_TOKEN_BATCH_SIZE,
			3,
		]);
		expect(h.batches.every((b) => b.committed)).toBe(true);
		expect(h.queries.every((q) => q.limit === SUBSCRIPTION_TOKEN_BATCH_SIZE)).toBe(true);
	});
});

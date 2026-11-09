import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-admin/firestore', () => ({
	FieldPath: { documentId: () => '__name__' },
	getFirestore: jest.fn(),
}));

import {
	BACKFILL_SOURCE,
	backfillPushTokens,
	EXISTING_DOC_LOOKUP_CHUNK,
	SUBSCRIPTION_PAGE_SIZE,
} from '../backfillPushTokensFromSubscriptions';

const NOW = 1_800_000_000_000;

interface Sub {
	id: string;
	getPushNotification?: boolean;
	tokens?: unknown;
	userId?: string;
	user?: { uid: string };
	lastUpdate?: unknown;
	lastTokenUpdate?: unknown;
}

type Stored = Record<string, unknown>;

interface Harness {
	db: Firestore;
	store: Map<string, Stored>;
	writes: string[];
	deletes: string[];
	getAllSizes: number[];
	pageLimits: number[];
}

function field(source: Record<string, unknown>, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], source);
}

function createHarness(subs: Sub[], existing: Record<string, Stored> = {}): Harness {
	const store = new Map(Object.entries(existing));
	const writes: string[] = [];
	const deletes: string[] = [];
	const getAllSizes: number[] = [];
	const pageLimits: number[] = [];

	const makeDoc = (sub: Sub) => ({ id: sub.id, get: (path: string) => field({ ...sub }, path) });

	const makePage = (after?: { id: string }, size = 0): Record<string, unknown> => ({
		orderBy: () => makePage(after, size),
		select: () => makePage(after, size),
		limit: (n: number) => makePage(after, n),
		startAfter: (doc: { id: string }) => makePage(doc, size),
		get: async () => {
			pageLimits.push(size);
			const eligible = subs
				.filter((sub) => sub.getPushNotification !== false)
				.sort((a, b) => a.id.localeCompare(b.id))
				.filter((sub) => !after || sub.id > after.id)
				.slice(0, size);

			return { docs: eligible.map(makeDoc) };
		},
	});

	const assertAbsent = (id: string): void => {
		if (store.has(id)) throw Object.assign(new Error(`exists: ${id}`), { code: 6 });
	};

	const db = {
		collection: (name: string) => ({
			where: (fieldName: string, op: string, value: unknown) => {
				expect([name, fieldName, op, value]).toEqual([
					'statementsSubscribe',
					'getPushNotification',
					'==',
					true,
				]);

				return makePage();
			},
			doc: (id: string) => ({
				id,
				create: async (data: Stored) => {
					assertAbsent(id);
					store.set(id, data);
					writes.push(id);
				},
				delete: async () => deletes.push(id),
			}),
		}),
		getAll: async (...refs: Array<{ id: string }>) => {
			getAllSizes.push(refs.length);

			return refs.map(({ id }) => ({
				exists: store.has(id),
				get: (path: string) => store.get(id)?.[path],
			}));
		},
		batch: () => {
			const pending: Array<{ id: string; data: Stored }> = [];

			return {
				create: (ref: { id: string }, data: Stored) => pending.push({ id: ref.id, data }),
				commit: async () => {
					pending.forEach(({ id }) => assertAbsent(id));
					pending.forEach(({ id, data }) => {
						store.set(id, data);
						writes.push(id);
					});
				},
			};
		},
	} as unknown as Firestore;

	return { db, store, writes, deletes, getAllSizes, pageLimits };
}

const sub = (id: string, userId: string, tokens: unknown, lastUpdate = 1): Sub => ({
	id,
	userId,
	tokens,
	lastUpdate,
});

describe('backfillPushTokens', () => {
	beforeEach(() => {
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('dry run counts what it would create and writes nothing', async () => {
		const harness = createHarness([sub('a', 'u1', ['t1', 't2'])]);

		const report = await backfillPushTokens(harness.db, false, NOW);

		expect(report).toMatchObject({ execute: false, distinctTokens: 2, toCreate: 2, created: 0 });
		expect(harness.writes).toEqual([]);
		expect(harness.store.size).toBe(0);
	});

	it('creates a doc in the shape the rules and senders expect', async () => {
		const harness = createHarness([sub('a', 'u1', ['t1'])]);

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(report.created).toBe(1);
		expect(harness.store.get('t1')).toEqual({
			token: 't1',
			userId: 'u1',
			lastUpdate: NOW,
			source: BACKFILL_SOURCE,
		});
	});

	it('never overwrites an existing doc, even one owned by someone else', async () => {
		const fresh = { token: 't1', userId: 'other', lastUpdate: 5 };
		const harness = createHarness([sub('a', 'u1', ['t1'])], { t1: fresh });

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('t1')).toBe(fresh);
		expect(harness.writes).toEqual([]);
		expect(report).toMatchObject({
			alreadyInPushNotifications: 1,
			alreadyOwnedByAnotherUser: 1,
			toCreate: 0,
		});
	});

	it('is idempotent: a second run creates nothing', async () => {
		const harness = createHarness([sub('a', 'u1', ['t1'])]);

		await backfillPushTokens(harness.db, true, NOW);
		const second = await backfillPushTokens(harness.db, true, NOW + 1);

		expect(second).toMatchObject({ toCreate: 0, created: 0, alreadyInPushNotifications: 1 });
		expect(harness.store.get('t1')?.lastUpdate).toBe(NOW);
	});

	it('gives a duplicate-owner token to the most recently updated subscription', async () => {
		const harness = createHarness([sub('a', 'older', ['t1'], 10), sub('b', 'newer', ['t1'], 20)]);

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('t1')?.userId).toBe('newer');
		expect(report.duplicateOwnerTokens).toBe(1);
	});

	it('counts a token sync as an update when choosing the owner', async () => {
		const harness = createHarness([
			sub('a', 'edited', ['t1'], 20),
			{ ...sub('b', 'synced', ['t1'], 10), lastTokenUpdate: 30 },
		]);

		await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('t1')?.userId).toBe('synced');
	});

	it('breaks a tie the same way in any order', async () => {
		const forward = createHarness([sub('a', 'zed', ['t1'], 10), sub('b', 'amy', ['t1'], 10)]);
		const backward = createHarness([sub('a', 'amy', ['t1'], 10), sub('b', 'zed', ['t1'], 10)]);

		await backfillPushTokens(forward.db, true, NOW);
		await backfillPushTokens(backward.db, true, NOW);

		expect(forward.store.get('t1')?.userId).toBe('amy');
		expect(backward.store.get('t1')?.userId).toBe('amy');
	});

	it('does not count one user on two subscriptions as a duplicate owner', async () => {
		const harness = createHarness([sub('a', 'u1', ['t1']), sub('b', 'u1', ['t1'])]);

		await expect(backfillPushTokens(harness.db, false, NOW)).resolves.toMatchObject({
			duplicateOwnerTokens: 0,
			distinctTokens: 1,
		});
	});

	it('reads a Firestore Timestamp on an older subscription', async () => {
		const harness = createHarness([
			{ ...sub('a', 'legacy', ['t1']), lastUpdate: { toMillis: () => 50 } },
			sub('b', 'current', ['t1'], 40),
		]);

		await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('t1')?.userId).toBe('legacy');
	});

	it('leaves out switched-off subscriptions', async () => {
		const harness = createHarness([{ ...sub('a', 'u1', ['t1']), getPushNotification: false }]);

		await expect(backfillPushTokens(harness.db, true, NOW)).resolves.toMatchObject({
			subscriptionsScanned: 0,
			created: 0,
		});
	});

	it('skips tokens that cannot be a document id and subscriptions with no user', async () => {
		const harness = createHarness([
			sub('a', 'u1', ['has/slash', '', 7, 'x'.repeat(1501), 'good']),
			{ id: 'b', tokens: ['orphan'] },
		]);

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(report).toMatchObject({
			malformedTokens: 4,
			subscriptionsWithoutUser: 1,
			created: 1,
		});
		expect([...harness.store.keys()]).toEqual(['good']);
	});

	it('takes the owner from user.uid on a legacy doc with no userId', async () => {
		const harness = createHarness([{ id: 'a', user: { uid: 'legacy' }, tokens: ['t1'] }]);

		await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('t1')?.userId).toBe('legacy');
	});

	it('keeps a doc a device wrote during the run, and still creates the rest', async () => {
		const harness = createHarness([sub('a', 'u1', ['racing', 'free'])]);
		const device = { token: 'racing', userId: 'device-owner' };
		const realGetAll = harness.db.getAll.bind(harness.db);
		harness.db.getAll = (async (...args: Parameters<typeof realGetAll>) => {
			const snaps = await realGetAll(...args);
			harness.store.set('racing', device);

			return snaps;
		}) as typeof harness.db.getAll;

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(harness.store.get('racing')).toBe(device);
		expect(harness.store.get('free')?.userId).toBe('u1');
		expect(report).toMatchObject({ created: 1, lostRaceToExistingDoc: 1, failed: 0 });
	});

	it('walks every page and never deletes', async () => {
		const subs = Array.from({ length: SUBSCRIPTION_PAGE_SIZE + 1 }, (_, i) =>
			sub(`s${String(i).padStart(5, '0')}`, `u${i}`, [`t${i}`]),
		);
		const harness = createHarness(subs);

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(report.subscriptionsScanned).toBe(SUBSCRIPTION_PAGE_SIZE + 1);
		expect(report.created).toBe(SUBSCRIPTION_PAGE_SIZE + 1);
		expect(harness.pageLimits).toHaveLength(2);
		expect(Math.max(...harness.getAllSizes)).toBe(EXISTING_DOC_LOOKUP_CHUNK);
		expect(harness.deletes).toEqual([]);
	});

	it('prints no token in its report', async () => {
		const harness = createHarness([sub('a', 'u1', ['secret-token'])]);

		const report = await backfillPushTokens(harness.db, true, NOW);

		expect(JSON.stringify(report)).not.toContain('secret-token');
	});
});

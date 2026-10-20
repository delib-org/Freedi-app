import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role } from '@freedi/shared-types';
import {
	BACKFILL_PROGRESS_COLLECTION,
	BACKFILL_PROGRESS_DOC_ID,
	backfillUserFeed,
} from '../backfillUserFeed';
import { FakeFirestore } from '../../userFeed/__tests__/fakeFirestore';

const T0 = 1_800_000_000_000;

function seedSubscription(
	db: FakeFirestore,
	userId: string,
	statementId: string,
	fields: Record<string, unknown>,
): void {
	db.seed(Collections.statementsSubscribe, `${userId}--${statementId}`, {
		userId,
		statementId,
		role: Role.member,
		lastUpdate: T0,
		...fields,
	});
}

describe('backfillUserFeed', () => {
	let db: FakeFirestore;
	const firestore = (): Firestore => db as unknown as Firestore;

	beforeEach(() => {
		db = new FakeFirestore();
		for (let i = 0; i < 7; i++)
			seedSubscription(db, 'alice', `top-${i}`, { parentId: 'top', lastUpdate: T0 + i });
		seedSubscription(db, 'alice', 'legacy-top', {
			statement: { parentId: 'top' },
			lastUpdate: T0 + 100,
		});
		seedSubscription(db, 'alice', 'question-1', { parentId: 'top-1' });
		seedSubscription(db, 'bob', 'top-0', { parentId: 'top', role: Role.banned });
		seedSubscription(db, 'carol', 'top-0', { parentId: 'top', role: Role.waiting });
	});

	it('creates one entry per eligible top-level membership, including legacy embedded parentId', async () => {
		const progress = await backfillUserFeed(firestore(), { pageSize: 3, now: T0 });

		expect(progress.done).toBe(true);
		expect(db.size(Collections.userFeed)).toBe(9);
		expect(db.read(Collections.userFeed, 'alice--legacy-top')).toMatchObject({
			userId: 'alice',
			statementId: 'legacy-top',
			subscriptionId: 'alice--legacy-top',
			lastActivity: T0 + 100,
		});
		expect(db.read(Collections.userFeed, 'alice--question-1')).toBeUndefined();
		expect(db.read(Collections.userFeed, 'bob--top-0')).toBeUndefined();
		expect(db.read(Collections.userFeed, 'carol--top-0')).toBeDefined(); // waiting keeps its entry
	});

	it('is bounded and resumable: maxPages per run, cursor saved between runs', async () => {
		const first = await backfillUserFeed(firestore(), { pageSize: 3, maxPages: 1, now: T0 });

		expect(first.done).toBe(false);
		expect(first.cursor).not.toBeNull();
		expect(db.read(BACKFILL_PROGRESS_COLLECTION, BACKFILL_PROGRESS_DOC_ID)).toMatchObject({
			cursor: first.cursor,
		});

		let progress = first;
		let runs = 1;
		while (!progress.done) {
			progress = await backfillUserFeed(firestore(), { pageSize: 3, maxPages: 1, now: T0 });
			runs++;
		}
		expect(runs).toBeGreaterThan(2);
		expect(db.size(Collections.userFeed)).toBe(9);
	});

	it('is idempotent and never moves an entry backwards', async () => {
		await backfillUserFeed(firestore(), { now: T0 });
		db.seed(Collections.userFeed, 'alice--top-0', {
			...db.read(Collections.userFeed, 'alice--top-0'),
			lastActivity: T0 + 999,
		});
		db.resetCounters();

		const again = await backfillUserFeed(firestore(), { restart: true, now: T0 });

		expect(again.created).toBe(0);
		expect(again.raised).toBe(0);
		expect(db.writesTo(Collections.userFeed)).toBe(0);
		expect(db.read(Collections.userFeed, 'alice--top-0')?.lastActivity).toBe(T0 + 999);
	});

	it('dry run writes nothing', async () => {
		const progress = await backfillUserFeed(firestore(), { dryRun: true, now: T0 });

		expect(progress.created).toBe(9);
		expect(db.writes).toBe(0);
	});
});

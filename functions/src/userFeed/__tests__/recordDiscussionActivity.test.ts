import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role } from '@freedi/shared-types';
import { recordDiscussionActivity } from '../recordDiscussionActivity';
import { reconcileUserFeedEntry } from '../userFeedMembership';
import { USER_FEED_ACTIVITY_WINDOW_MS } from '../userFeedConfig';
import { FakeFirestore } from './fakeFirestore';

const DISCUSSION = 'discussion-1';
const T0 = 1_800_000_000_000;
const SECOND = 1000;
const HOME_PAGE_SIZE = 30;

function seedMember(
	db: FakeFirestore,
	userId: string,
	statementId: string,
	lastUpdate: number,
	role = Role.member,
): string {
	const subscriptionId = `${userId}--${statementId}`;
	db.seed(Collections.statementsSubscribe, subscriptionId, {
		statementsSubscribeId: subscriptionId,
		userId,
		statementId,
		role,
		parentId: 'top',
		statementType: 'group',
		lastUpdate,
		createdAt: lastUpdate,
		statement: { statementId, parentId: 'top' },
	});

	return subscriptionId;
}

async function join(
	db: FakeFirestore,
	userId: string,
	statementId: string,
	lastUpdate: number,
): Promise<void> {
	const subscriptionId = seedMember(db, userId, statementId, lastUpdate);
	await reconcileUserFeedEntry(db as unknown as Firestore, {
		subscriptionId,
		userId,
		statementId,
		now: lastUpdate,
	});
}

/** The exact query the home page runs (src/controllers/db/userFeed/listenToUserFeed.ts). */
async function homePage(db: FakeFirestore, userId: string, after?: number): Promise<string[]> {
	let page = db
		.collection(Collections.userFeed)
		.where('userId', '==', userId)
		.orderBy('lastActivity', 'desc');
	if (after !== undefined) page = page.startAfter(after);
	const snapshot = await page.limit(HOME_PAGE_SIZE).get();

	return snapshot.docs.map((doc) => (doc.data() as { statementId: string }).statementId);
}

describe('recordDiscussionActivity', () => {
	let db: FakeFirestore;
	const firestore = (): Firestore => db as unknown as Firestore;

	beforeEach(() => {
		db = new FakeFirestore();
	});

	describe('coalescing (once per discussion per window)', () => {
		beforeEach(async () => {
			for (let i = 0; i < 10; i++) await join(db, `user-${i}`, DISCUSSION, T0);
			db.resetCounters();
		});

		it('fans out on the first activity and writes every member feed doc once', async () => {
			const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0 + SECOND,
				stampSubscriptions: false,
			});

			expect(result).toEqual({ fannedOut: true, feedDocsUpdated: 10, subscriptionsStamped: 0 });
			expect(db.writesTo(Collections.userFeed, 'update')).toBe(10);
			expect(db.writesTo(Collections.statementsSubscribe)).toBe(0);
		});

		it('writes nothing for 50 more messages inside the same minute', async () => {
			await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0,
				stampSubscriptions: false,
			});
			db.resetCounters();

			for (let i = 1; i <= 50; i++) {
				const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
					now: T0 + i * SECOND,
					stampSubscriptions: false,
				});
				expect(result.fannedOut).toBe(i * SECOND >= USER_FEED_ACTIVITY_WINDOW_MS);
			}
			// 50 messages over 50s: all inside the window, each costs one throttle read
			expect(db.writes).toBe(0);
			expect(db.reads).toBe(50);
		});

		it('fans out again once the window has passed', async () => {
			await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0,
				stampSubscriptions: false,
			});
			db.resetCounters();
			const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0 + USER_FEED_ACTIVITY_WINDOW_MS,
				stampSubscriptions: false,
			});

			expect(result.fannedOut).toBe(true);
			expect(db.read(Collections.userFeed, `user-3--${DISCUSSION}`)?.lastActivity).toBe(
				T0 + USER_FEED_ACTIVITY_WINDOW_MS,
			);
		});

		it('phase 1 also stamps the legacy subscription lastUpdate, under the same window', async () => {
			const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0 + SECOND,
				stampSubscriptions: true,
			});
			const again = await recordDiscussionActivity(firestore(), DISCUSSION, {
				now: T0 + 2 * SECOND,
				stampSubscriptions: true,
			});

			expect(result.subscriptionsStamped).toBe(10);
			expect(again.fannedOut).toBe(false);
			expect(db.read(Collections.statementsSubscribe, `user-0--${DISCUSSION}`)?.lastUpdate).toBe(
				T0 + SECOND,
			);
		});

		it('ignores the "top" pseudo-parent and missing ids', async () => {
			expect((await recordDiscussionActivity(firestore(), 'top')).fannedOut).toBe(false);
			expect((await recordDiscussionActivity(firestore(), undefined)).fannedOut).toBe(false);
			expect(db.reads + db.writes).toBe(0);
		});
	});

	it('pages through more members than one batch holds', async () => {
		const members = 1234;
		for (let i = 0; i < members; i++) seedMember(db, `u${i}`, DISCUSSION, T0);
		for (let i = 0; i < members; i++) {
			db.seed(Collections.userFeed, `u${i}--${DISCUSSION}`, {
				userId: `u${i}`,
				statementId: DISCUSSION,
				lastActivity: T0,
			});
		}
		const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
			now: T0 + SECOND,
			stampSubscriptions: true,
		});

		expect(result.feedDocsUpdated).toBe(members);
		expect(result.subscriptionsStamped).toBe(members);
	});

	it('skips a member who left between the query and the commit instead of resurrecting them', async () => {
		for (let i = 0; i < 3; i++) await join(db, `user-${i}`, DISCUSSION, T0);
		const realBatch = db.batch.bind(db);
		let first = true;
		db.batch = () => {
			const batch = realBatch();
			if (first) {
				first = false;
				db.rowsOf(Collections.userFeed).delete(`user-1--${DISCUSSION}`);
			}

			return batch;
		};

		const result = await recordDiscussionActivity(firestore(), DISCUSSION, {
			now: T0 + SECOND,
			stampSubscriptions: false,
		});

		expect(result.feedDocsUpdated).toBe(2);
		expect(db.read(Collections.userFeed, `user-1--${DISCUSSION}`)).toBeUndefined();
	});

	describe('home ordering across a pagination boundary', () => {
		const USER = 'alice';
		const DISCUSSIONS = 35;

		beforeEach(async () => {
			// d-0 is the oldest discussion, d-34 the newest
			for (let i = 0; i < DISCUSSIONS; i++) await join(db, USER, `d-${i}`, T0 + i * SECOND);
		});

		it('keeps the oldest discussion off page 1 while it is quiet', async () => {
			const page1 = await homePage(db, USER);

			expect(page1).toHaveLength(HOME_PAGE_SIZE);
			expect(page1).not.toContain('d-0');
			expect(page1[0]).toBe('d-34');
		});

		it('brings the oldest discussion to the top of page 1 when it becomes active', async () => {
			await recordDiscussionActivity(firestore(), 'd-0', {
				now: T0 + DISCUSSIONS * SECOND,
				stampSubscriptions: false,
			});
			const page1 = await homePage(db, USER);

			expect(page1[0]).toBe('d-0');
			expect(page1).toHaveLength(HOME_PAGE_SIZE);
		});

		it('pages 1 and 2 together hold every discussion exactly once after the move', async () => {
			await recordDiscussionActivity(firestore(), 'd-0', {
				now: T0 + DISCUSSIONS * SECOND,
				stampSubscriptions: false,
			});
			const page1 = await homePage(db, USER);
			const cursor = db.read(Collections.userFeed, `${USER}--${page1[page1.length - 1]}`)
				?.lastActivity as number;
			const page2 = await homePage(db, USER, cursor);

			expect(new Set([...page1, ...page2]).size).toBe(DISCUSSIONS);
			expect(page1.length + page2.length).toBe(DISCUSSIONS);
		});
	});
});

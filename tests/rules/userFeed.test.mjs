import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
	setDoc,
	startAfter,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * `userFeed` is the home page's activity feed: one doc per (user, top-level
 * discussion), written only by Cloud Functions. A user may read their own
 * entries and nothing else; nobody writes from a client — a client that could
 * stamp lastActivity could pin a discussion to the top of a home page.
 */
describe('userFeed', () => {
	let env;

	const ALICE = 'user-alice';
	const BOB = 'user-bob';
	const T0 = 1_800_000_000_000;
	const PAGE = 30;
	const DISCUSSIONS = 35;

	const entry = (userId, statementId, lastActivity) => ({
		feedId: `${userId}--${statementId}`,
		userId,
		statementId,
		subscriptionId: `${userId}--${statementId}`,
		lastActivity,
		createdAt: T0,
	});

	before(async () => {
		env = await makeEnv('user-feed');
		await seed(env, async (db) => {
			for (let i = 0; i < DISCUSSIONS; i++) {
				await setDoc(doc(db, 'userFeed', `${ALICE}--d-${i}`), entry(ALICE, `d-${i}`, T0 + i));
			}
			await setDoc(doc(db, 'userFeed', `${BOB}--d-0`), entry(BOB, 'd-0', T0));
			await setDoc(doc(db, 'userFeedThrottle', 'd-0'), { statementId: 'd-0', lastFanoutAt: T0 });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	const homeQuery = (db, userId, ...extra) =>
		query(collection(db, 'userFeed'), where('userId', '==', userId), orderBy('lastActivity', 'desc'), ...extra);

	it('lets a user read their own feed entry', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertSucceeds(getDoc(doc(db, 'userFeed', `${ALICE}--d-0`)));
	});

	it("refuses another user's feed entry", async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(getDoc(doc(db, 'userFeed', `${BOB}--d-0`)));
	});

	it('lets a user run the home query on their own feed', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertSucceeds(getDocs(homeQuery(db, ALICE, limit(PAGE))));
	});

	it("refuses the home query for someone else's feed, and an unfiltered list", async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(getDocs(homeQuery(db, BOB, limit(PAGE))));
		await assertFails(getDocs(query(collection(db, 'userFeed'), limit(PAGE))));
	});

	it('refuses anonymous readers', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(getDocs(homeQuery(db, ALICE, limit(PAGE))));
	});

	it('refuses every client write, even to your own entry', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(setDoc(doc(db, 'userFeed', `${ALICE}--new`), entry(ALICE, 'new', T0)));
		await assertFails(updateDoc(doc(db, 'userFeed', `${ALICE}--d-0`), { lastActivity: T0 * 2 }));
		await assertFails(deleteDoc(doc(db, 'userFeed', `${ALICE}--d-0`)));
	});

	it('keeps the throttle marker server-only', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(getDoc(doc(db, 'userFeedThrottle', 'd-0')));
		await assertFails(setDoc(doc(db, 'userFeedThrottle', 'd-0'), { statementId: 'd-0', lastFanoutAt: 0 }));
	});

	it('pagination boundary: the oldest discussion reaches page 1 once the server records activity', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		const ids = (snap) => snap.docs.map((d) => d.data().statementId);

		const quiet = await getDocs(homeQuery(db, ALICE, limit(PAGE)));
		assert.equal(quiet.size, PAGE);
		assert.ok(!ids(quiet).includes('d-0'), 'd-0 must start beyond page 1');

		// what recordDiscussionActivity writes (server, past the rules)
		await seed(env, async (admin) => {
			await updateDoc(doc(admin, 'userFeed', `${ALICE}--d-0`), { lastActivity: T0 + DISCUSSIONS });
		});

		const active = await getDocs(homeQuery(db, ALICE, limit(PAGE)));
		assert.equal(ids(active)[0], 'd-0');

		const cursor = active.docs[active.docs.length - 1].data().lastActivity;
		const page2 = await getDocs(homeQuery(db, ALICE, startAfter(cursor), limit(PAGE)));
		const all = [...ids(active), ...ids(page2)];
		assert.equal(all.length, DISCUSSIONS);
		assert.equal(new Set(all).size, DISCUSSIONS);
	});
});

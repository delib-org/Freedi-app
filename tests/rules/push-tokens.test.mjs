import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * `pushNotifications/{token}` decides which device gets whose notifications:
 * the server finds a person's docs by `userId` and pushes to their `token`.
 * Sign-in on a shared browser legitimately re-points a doc, so the safety rests
 * on two things tested here: a token is readable only by its owner, and the
 * token in a doc is always the one in its id.
 */
const ME = 'user-me';
const VICTIM = 'user-victim';

describe('pushNotifications tokens', () => {
	let env;

	before(async () => {
		env = await makeEnv('push-tokens');
	});

	after(async () => {
		await env?.cleanup();
	});

	const asMe = () => env.authenticatedContext(ME).firestore();
	const tokens = (db) => collection(db, 'pushNotifications');
	const ref = (db, id) => doc(db, 'pushNotifications', id);
	const seedToken = (id, data) =>
		seed(env, async (db) => {
			await setDoc(ref(db, id), data);
		});

	describe('redirecting someone’s notifications', () => {
		it('refuses registering my device in the victim’s name', async () => {
			await assertFails(setDoc(ref(asMe(), 'my-token'), { token: 'my-token', userId: VICTIM }));
		});

		it('refuses a document whose token is not the one in its id', async () => {
			await assertFails(setDoc(ref(asMe(), 'any-id'), { token: 'their-token', userId: ME }));
		});

		it('refuses a new document with no token', async () => {
			await assertFails(setDoc(ref(asMe(), 'no-token'), { userId: ME }));
		});

		it('refuses re-aiming my own document at another token', async () => {
			await seedToken('my-own', { token: 'my-own', userId: ME });
			await assertFails(updateDoc(ref(asMe(), 'my-own'), { token: 'their-token' }));
		});

		it('refuses a takeover that also swaps the token', async () => {
			await seedToken('shared-1', { token: 'shared-1', userId: VICTIM });
			await assertFails(
				setDoc(ref(asMe(), 'shared-1'), { token: 'other-token', userId: ME }, { merge: true }),
			);
		});

		it('refuses editing the victim’s document while it stays theirs', async () => {
			await seedToken('theirs-1', { token: 'theirs-1', userId: VICTIM });
			await assertFails(updateDoc(ref(asMe(), 'theirs-1'), { app: 'join-class' }));
		});
	});

	describe('the writes that must keep working', () => {
		it('registers my own device', async () => {
			await assertSucceeds(setDoc(ref(asMe(), 'fresh'), { token: 'fresh', userId: ME }));
		});

		it('refreshes my own device with a merge', async () => {
			await seedToken('refresh', { token: 'refresh', userId: ME });
			await assertSucceeds(
				setDoc(ref(asMe(), 'refresh'), { token: 'refresh', userId: ME, lastRefresh: 2 }, { merge: true }),
			);
		});

		it('lets the next person to sign in on a device take its token over', async () => {
			await seedToken('shared-2', { token: 'shared-2', userId: VICTIM });
			await assertSucceeds(
				setDoc(ref(asMe(), 'shared-2'), { token: 'shared-2', userId: ME }, { merge: true }),
			);
		});

		it('lets an owner save quiet hours on an old document with no token field', async () => {
			await seedToken('legacy', { userId: ME });
			await assertSucceeds(updateDoc(ref(asMe(), 'legacy'), { quietHours: { enabled: true } }));
		});
	});

	describe('reading', () => {
		before(async () => {
			await seedToken('mine-read', { token: 'mine-read', userId: ME });
			await seedToken('theirs-read', { token: 'theirs-read', userId: VICTIM });
		});

		it('reads my own document', async () => {
			await assertSucceeds(getDoc(ref(asMe(), 'mine-read')));
		});

		it('queries my own tokens', async () => {
			await assertSucceeds(getDocs(query(tokens(asMe()), where('userId', '==', ME))));
		});

		it('reads a token not registered yet, the first check on a new device', async () => {
			await assertSucceeds(getDoc(ref(asMe(), 'never-registered')));
		});

		it('refuses another person’s document', async () => {
			await assertFails(getDoc(ref(asMe(), 'theirs-read')));
		});

		it('refuses querying another person’s tokens', async () => {
			await assertFails(getDocs(query(tokens(asMe()), where('userId', '==', VICTIM))));
		});

		it('refuses listing the collection', async () => {
			await assertFails(getDocs(tokens(asMe())));
		});

		it('refuses a query on anything but my userId', async () => {
			await assertFails(getDocs(query(tokens(asMe()), where('app', '==', 'join-class'))));
		});

		it('refuses an unauthenticated read', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(ref(db, 'mine-read')));
			await assertFails(getDocs(tokens(db)));
		});
	});
});

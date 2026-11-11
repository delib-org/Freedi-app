import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	arrayRemove,
	arrayUnion,
	deleteDoc,
	deleteField,
	doc,
	getDoc,
	setDoc,
	updateDoc,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * STAGE 1 NOTE (private-level reads, `accessScope`): dev still runs the OLD
 * firestore.rules, where any signed-in user can read a subscription. The last
 * test below asserts that. The NEW rules ship LAST, after Tal's separate yes,
 * from `fix/private-statement-reads` rebased onto dev at that time (see
 * docs/security/access-scope-release.md, "Stage 2: the rules"); that change
 * flips the last test to assertFails for a stranger.
 */

/**
 * statementsSubscribe.tokens is being retired: any signed-in user can read a
 * subscription (until the private-reads rules ship; then only its owner,
 * those in the statement and hosts can), so the field may only shrink. Old cached clients must still be
 * able to JOIN, and they send one token inside the write that creates the doc,
 * so that one shape stays allowed (the server removes the token afterwards).
 * The shapes below are what those clients really send: see
 * setStatementSubscriptionToDB and addTokenToSubscription as of dev e39481f0f.
 */
describe('statementsSubscribe.tokens is retired', () => {
	let env;

	const ME = 'u-member';
	const OTHER = 'u-other';
	const OPEN = 'open-question';
	const MODERATED = 'moderated-question';
	const T0 = 1_800_000_000_000;

	const statement = (id, access) => ({
		statementId: id,
		statement: id,
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		parents: [],
		creatorId: OTHER,
		creator: { uid: OTHER, displayName: 'Other' },
		membership: { access },
		createdAt: T0,
		lastUpdate: T0,
		consensus: 0,
	});
	const sub = (statementId, role, extra = {}) => ({
		statementsSubscribeId: `${ME}--${statementId}`,
		userId: ME,
		statementId,
		role,
		user: { uid: ME, displayName: 'Me', photoURL: null, isAnonymous: false },
		lastUpdate: T0,
		createdAt: T0,
		getInAppNotification: true,
		getEmailNotification: false,
		getPushNotification: true,
		...extra,
	});
	const as = (uid) => env.authenticatedContext(uid).firestore();
	const ref = (db, statementId) => doc(db, 'statementsSubscribe', `${ME}--${statementId}`);
	const seedSub = (extra) =>
		seed(env, async (db) => {
			await setDoc(ref(db, OPEN), sub(OPEN, 'member', extra));
		});

	before(async () => {
		env = await makeEnv('subscription-tokens');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', OPEN), statement(OPEN, 'openToAll'));
			await setDoc(doc(db, 'statements', MODERATED), statement(MODERATED, 'moderated'));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	beforeEach(async () => {
		await seed(env, async (db) => {
			await deleteDoc(ref(db, OPEN));
			await deleteDoc(ref(db, MODERATED));
		});
	});

	describe('joining', () => {
		it('lets a new client join without tokens', async () => {
			await assertSucceeds(setDoc(ref(as(ME), OPEN), sub(OPEN, 'member'), { merge: true }));
		});

		it('lets an old cached client join with the one token it sends', async () => {
			await assertSucceeds(
				setDoc(
					ref(as(ME), OPEN),
					{ ...sub(OPEN, 'member'), tokens: arrayUnion('old-device') },
					{ merge: true },
				),
			);
		});

		it('lets an old cached client ask to join a moderated question with its token', async () => {
			await assertSucceeds(
				setDoc(
					ref(as(ME), MODERATED),
					{ ...sub(MODERATED, 'waiting'), tokens: arrayUnion('old-device') },
					{ merge: true },
				),
			);
		});

		it('refuses creating a subscription with more than one token', async () => {
			await assertFails(setDoc(ref(as(ME), OPEN), sub(OPEN, 'member', { tokens: ['one', 'two'] })));
		});

		it('refuses a tokens field that is not a list', async () => {
			await assertFails(setDoc(ref(as(ME), OPEN), sub(OPEN, 'member', { tokens: 'one' })));
		});
	});

	describe('adding a token to an existing subscription', () => {
		it('refuses arrayUnion of a new token (old addTokenToSubscription)', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertFails(
				updateDoc(ref(as(ME), OPEN), { tokens: arrayUnion('device-2'), statementId: OPEN }),
			);
		});

		it('refuses a first token on a cleaned doc (old sync at app start)', async () => {
			await seedSub({});
			await assertFails(
				updateDoc(ref(as(ME), OPEN), { tokens: arrayUnion('device-1'), lastTokenUpdate: T0 + 1 }),
			);
		});

		it('refuses swapping one token for another', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertFails(updateDoc(ref(as(ME), OPEN), { tokens: ['device-2'] }));
		});
	});

	describe('the writes that must keep working', () => {
		it('lets an old client re-send a token already listed', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertSucceeds(
				updateDoc(ref(as(ME), OPEN), { tokens: arrayUnion('device-1'), statementId: OPEN }),
			);
		});

		it('lets an old client rewrite the whole doc with the same tokens', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertSucceeds(
				setDoc(ref(as(ME), OPEN), sub(OPEN, 'member', { tokens: ['device-1'], lastUpdate: T0 + 2 })),
			);
		});

		it('lets an owner remove a token (unsubscribe, sign-out)', async () => {
			await seedSub({ tokens: ['device-1', 'device-2'] });
			await assertSucceeds(
				updateDoc(ref(as(ME), OPEN), { tokens: arrayRemove('device-1'), statementId: OPEN }),
			);
		});

		it('lets an owner remove the field entirely', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertSucceeds(updateDoc(ref(as(ME), OPEN), { tokens: deleteField() }));
		});

		it('lets an old client arrayRemove on a cleaned doc, which writes an empty list', async () => {
			await seedSub({});
			await assertSucceeds(
				updateDoc(ref(as(ME), OPEN), { tokens: arrayRemove('device-1'), statementId: OPEN }),
			);
		});

		it('lets notification preferences change on a doc that still lists tokens', async () => {
			await seedSub({ tokens: ['device-1'] });
			await assertSucceeds(
				updateDoc(ref(as(ME), OPEN), {
					getPushNotification: false,
					statementId: OPEN,
					lastUpdate: T0 + 3,
				}),
			);
		});

		// STAGE 1: dev's rules still let any signed-in user read a subscription.
		// When the new rules ship (see the note at the top), this test becomes
		// 'no longer shows the old field to a signed-in stranger': assertFails.
		it('still shows the old field to any signed-in reader until the cleanup has run', async () => {
			await seedSub({ tokens: ['device-1'] });
			const snapshot = await assertSucceeds(getDoc(ref(as(OTHER), OPEN)));
			if (!Array.isArray(snapshot.data().tokens)) {
				throw new Error('expected the old field to be readable');
			}
		});
	});
});

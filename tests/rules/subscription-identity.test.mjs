import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * statementsSubscribe: a doc's id `{uid}--{statementId}` must match its contents.
 * Every admin check finds a subscription by its doc id; the access checks read
 * its fields. A doc whose fields name another statement than its id (way A), an
 * update that moves statementId / userId / user.uid (way B), or the promotion of
 * a doc whose id already disagrees (way C) would make the writer admin of a
 * statement they have no right to. Every client builds the id as
 * `${uid}--${statementId}`; these tests pin both the refusals and the shapes the
 * main app, Join and join-class really write.
 */
describe('statementsSubscribe identity', () => {
	let env;

	const A = 'u-attacker';
	const S1 = 'u-student';
	const OWNER = 'u-owner';
	const OWN = 'own-statement'; // created by A
	const X = 'victim-statement'; // created by OWNER, A has no rights on it
	const OPEN_Q = 'open-question';
	const LEGACY = 'legacy-statement';
	const LEGACY2 = 'legacy-statement-2';
	const LESSON = 'lesson-main';
	const T0 = 1_800_000_000_000;

	const statement = (id, overrides = {}) => ({
		statementId: id,
		statement: id,
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		parents: [],
		creatorId: OWNER,
		creator: { uid: OWNER, displayName: 'Owner' },
		membership: { access: 'openToAll' },
		createdAt: T0,
		lastUpdate: T0,
		consensus: 0,
		...overrides,
	});
	const sub = (uid, statementId, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${statementId}`,
		userId: uid,
		statementId,
		role,
		user: { uid, displayName: 'Me', photoURL: null, isAnonymous: false },
		lastUpdate: T0,
		createdAt: T0,
		...extra,
	});
	const as = (uid) => env.authenticatedContext(uid).firestore();
	const subRef = (uid, id) => doc(as(uid), 'statementsSubscribe', id);

	before(async () => {
		env = await makeEnv('subscription-identity');
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', OWN),
				statement(OWN, { creatorId: A, creator: { uid: A, displayName: 'A' } }),
			);
			await setDoc(doc(db, 'statements', X), statement(X, { membership: { access: 'secret' } }));
			await setDoc(doc(db, 'statements', OPEN_Q), statement(OPEN_Q));
			await setDoc(doc(db, 'statements', LEGACY), statement(LEGACY));
			await setDoc(doc(db, 'statements', LEGACY2), statement(LEGACY2));
			await setDoc(doc(db, 'statements', LESSON), statement(LESSON, { statementType: 'group' }));
			await setDoc(doc(db, 'statementsSubscribe', `${A}--${OWN}`), sub(A, OWN, 'admin'));
			// way C: written before the fix, member role, id names X, fields name OWN
			await setDoc(doc(db, 'statementsSubscribe', `${A}--${X}`), {
				...sub(A, OWN, 'member'),
				statementsSubscribeId: `${A}--${X}`,
			});
			// legacy docs: one without statementId, one without userId
			await setDoc(doc(db, 'statementsSubscribe', `${S1}--${LEGACY}`), {
				userId: S1,
				role: 'member',
				lastUpdate: T0,
			});
			await setDoc(doc(db, 'statementsSubscribe', `${S1}--${LEGACY2}`), {
				statementId: LEGACY2,
				role: 'member',
				lastUpdate: T0,
			});
			// the server's admin copy: user = the statement's creator, not the subscriber
			await setDoc(
				doc(db, 'statementsSubscribe', `${S1}--${OPEN_Q}-copy`),
				{ ...sub(S1, `${OPEN_Q}-copy`, 'admin'), user: { uid: OWNER, displayName: 'Owner' } },
			);
			await setDoc(doc(db, 'statements', `${OPEN_Q}-copy`), statement(`${OPEN_Q}-copy`));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('refusals', () => {
		it('way A: refuses an id naming X holding the fields of a statement the writer owns', async () => {
			await assertFails(
				setDoc(subRef(A, `${A}--${X}-new`), {
					...sub(A, OWN, 'admin'),
					statementsSubscribeId: `${A}--${X}-new`,
				}),
			);
			await assertFails(
				setDoc(subRef(A, `${A}--${OPEN_Q}`), {
					...sub(A, OWN, 'admin'),
					statementsSubscribeId: `${A}--${OPEN_Q}`,
				}),
			);
		});

		it('refuses a create under someone else’s uid prefix or with a foreign user.uid', async () => {
			await assertFails(setDoc(subRef(A, `${S1}--${OWN}`), sub(A, OWN, 'admin')));
			await assertFails(
				setDoc(subRef(S1, `${S1}--${OPEN_Q}`), {
					...sub(S1, OPEN_Q, 'member'),
					user: { uid: 'victim', displayName: 'V' },
				}),
			);
		});

		it('way B: refuses moving statementId, userId or user.uid on update', async () => {
			const ref = subRef(A, `${A}--${OWN}`);
			await assertFails(updateDoc(ref, { statementId: X }));
			await assertFails(updateDoc(ref, { statementId: X, role: 'admin' }));
			await assertFails(updateDoc(ref, { userId: 'someone' }));
			await assertFails(updateDoc(ref, { 'user.uid': 'someone' }));
		});

		it('way C: a member doc with a mismatched id cannot be promoted to admin', async () => {
			// A is creator of OWN, which the doc's fields name, so isAdminOrCreator() holds
			const ref = subRef(A, `${A}--${X}`);
			await assertFails(updateDoc(ref, { role: 'admin' }));
			await assertFails(updateDoc(ref, { role: 'admin', statementId: OWN }));
			// fixing the fields to what the id names does not help either: A has no rights on X
			await assertFails(updateDoc(ref, { role: 'admin', statementId: X }));
		});
	});

	describe('legacy docs', () => {
		it('may gain the exact statementId the id names, never another', async () => {
			const ref = subRef(S1, `${S1}--${LEGACY}`);
			await assertFails(updateDoc(ref, { statementId: OPEN_Q }));
			await assertFails(updateDoc(ref, { statementId: OWN, role: 'member' }));
			await assertSucceeds(updateDoc(ref, { statementId: LEGACY, lastUpdate: T0 + 1 }));
		});

		it('may gain the exact userId the id names, never another (by the statement’s creator)', async () => {
			const ref = subRef(OWNER, `${S1}--${LEGACY2}`);
			await assertFails(updateDoc(ref, { userId: A }));
			await assertSucceeds(updateDoc(ref, { userId: S1, lastUpdate: T0 + 1 }));
		});
	});

	describe('real client shapes still pass', () => {
		it('main app: subscribe as member, bookmark, read mark, push token, display name', async () => {
			const ref = subRef(S1, `${S1}--${OPEN_Q}`);
			await assertSucceeds(
				setDoc(
					ref,
					sub(S1, OPEN_Q, 'member', {
						statement: statement(OPEN_Q),
						parentId: 'top',
						statementType: 'question',
						topParentId: OPEN_Q,
						getInAppNotification: true,
						getEmailNotification: false,
						getPushNotification: false,
					}),
					{ merge: true },
				),
			);
			await assertSucceeds(updateDoc(ref, { isBookmarked: true, lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { lastReadTimestamp: T0 + 2, statementId: OPEN_Q }));
			await assertSucceeds(updateDoc(ref, { tokens: arrayUnion('tok-1'), statementId: OPEN_Q }));
			await assertSucceeds(updateDoc(ref, { 'user.displayName': 'New name' }));
		});

		it('main app / Join / join-class: the creator gets an admin doc on their own statement', async () => {
			await setDoc(
				doc(as(S1), 'statements', 'mine'),
				statement('mine', { creatorId: S1, creator: { uid: S1, displayName: 'S' } }),
			);
			const ref = subRef(S1, `${S1}--mine`);
			await assertSucceeds(
				setDoc(ref, sub(S1, 'mine', 'admin', { openedInJoin: T0 }), { merge: true }),
			);
			// Join: markOpenedInJoin on a revisit; join-class: openedInClass
			await assertSucceeds(updateDoc(ref, { openedInJoin: T0 + 1, lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { openedInClass: T0 + 2, lastUpdate: T0 + 2 }));
		});

		it('the admin of a statement may still change a member’s role (ban, promote)', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'statementsSubscribe', `${S1}--${OWN}`), sub(S1, OWN, 'member'));
			});
			const ref = subRef(A, `${S1}--${OWN}`);
			await assertSucceeds(updateDoc(ref, { role: 'admin', statementId: OWN, lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { role: 'member', lastUpdate: T0 + 2 }));
			await assertSucceeds(updateDoc(ref, { role: 'banned', lastUpdate: T0 + 3 }));
		});

		it('the server’s admin copy (user = statement creator) stays updatable by its subscriber', async () => {
			const ref = subRef(S1, `${S1}--${OPEN_Q}-copy`);
			await assertSucceeds(updateDoc(ref, { isBookmarked: true, lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { 'user.uid': S1, 'user.displayName': 'Me' }));
		});

		it('join-class: the student join, name, side and read mark still pass', async () => {
			const ref = subRef(S1, `${S1}--${LESSON}`);
			await assertSucceeds(
				setDoc(
					ref,
					sub(S1, LESSON, 'member', {
						user: { uid: S1, displayName: 'Dana', photoURL: null, isAnonymous: true },
						parentId: 'top',
						topParentId: LESSON,
						statementType: 'group',
						statement: statement(LESSON, { statementType: 'group' }),
					}),
					{ merge: true },
				),
			);
			await assertSucceeds(updateDoc(ref, { 'user.displayName': 'Dana B', lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { side: 40, camp: 'a', lastUpdate: T0 + 2 }));
			await assertSucceeds(updateDoc(ref, { proposalRepliesReadAt: T0 + 3 }));
		});

		it('the subscriber may still delete a doc whose id disagrees (cleanup)', async () => {
			await assertSucceeds(deleteDoc(subRef(A, `${A}--${X}`)));
		});
	});
});

import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * statementsSubscribe, the paths the subscription block serves for EVERY app
 * (Trello btMVQMM5 restructured that block to stay inside the expression
 * budget; these pin that nothing else changed). Each expectation is what the
 * rules on dev answered before the restructure: run this file against them
 * with RULES_FILE=<path> to see the same results, and the full cross product
 * with tests/rules/differential/subscriptionDiff.mjs.
 *
 * Shapes are the ones the apps write: the main app's setStatementSubscriptionToDB
 * (src/controllers/db/subscriptions/setSubscriptions.ts:117), join / join-class
 * (apps/join-class/src/lib/classroom/studentWrites.ts:113), studio through
 * packages/event-core/src/createEvent.ts:98, sign (Admin SDK, but the same
 * shape: apps/sign/app/api/documents/mark-visited/route.ts:80).
 */
describe('statementsSubscribe: access, legacy docs and app shapes', () => {
	let env;
	const T0 = 1_800_000_000_000;
	const OWNER = 'u-owner';
	const S1 = 'u-s1';
	const S2 = 'u-s2';
	const ADMIN = 'u-admin';
	const NEW = 'u-new';

	const statement = (id, extra = {}) => ({
		statementId: id,
		statement: `statement ${id}`,
		parentId: 'top',
		topParentId: id,
		parents: [],
		statementType: 'question',
		creatorId: OWNER,
		creator: { uid: OWNER, displayName: 'Owner' },
		...extra,
	});
	const access = (value) => ({ membership: { access: value } });
	const STATEMENTS = {
		open: statement('open', access('openToAll')),
		pub: statement('pub', access('public')),
		reg: statement('reg', access('openForRegistered')),
		mod: statement('mod', access('moderated')),
		none: statement('none'),
		topOpen: statement('topOpen', access('openToAll')),
		topMod: statement('topMod', access('moderated')),
		inheritTop: statement('inheritTop', { topParentId: 'topOpen', parentId: 'topOpen', parents: ['topOpen'] }),
		inheritTopMod: statement('inheritTopMod', { topParentId: 'topMod', parentId: 'topMod', parents: ['topMod'] }),
		home: statement('home', { statementSettings: { classHome: { kind: 'teacher' } } }),
		homeLesson: statement('homeLesson', { topParentId: 'home', parentId: 'home', parents: ['home'], ...access('openToAll') }),
		inHome: statement('inHome', { topParentId: 'home', parentId: 'homeLesson', parents: ['home', 'homeLesson'] }),
	};

	const user = (uid) => ({ uid, displayName: `name ${uid}`, photoURL: null, isAnonymous: false });
	const ids = (uid, sid) => ({ statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid });
	const SHAPES = {
		main: (uid, sid, role) => ({
			...ids(uid, sid), role, user: user(uid), statement: STATEMENTS[sid],
			getInAppNotification: true, getEmailNotification: false, getPushNotification: false,
			parentId: 'top', statementType: 'question', topParentId: sid, lastUpdate: T0, createdAt: T0,
		}),
		classStudent: (uid, sid, role) => ({
			...ids(uid, sid), role, user: { uid, displayName: 'Dana', photoURL: null, isAnonymous: true },
			statement: STATEMENTS[sid], parentId: 'top', statementType: 'question', topParentId: sid, lastUpdate: T0, createdAt: T0,
		}),
		studio: (uid, sid, role) => ({
			...ids(uid, sid), role, user: user(uid), statement: STATEMENTS[sid], parentId: 'top',
			statementType: 'group', topParentId: sid, getInAppNotification: true, lastUpdate: T0, createdAt: T0,
		}),
		sign: (uid, sid, role) => ({
			...ids(uid, sid), role, isDocument: true, statement: STATEMENTS[sid],
			user: { displayName: 'Signer', uid }, lastUpdate: T0, createdAt: T0,
		}),
	};

	const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
	const ref = (uid, id) => doc(as(uid), 'statementsSubscribe', id);
	const put = (id, data) => seed(env, (db) => setDoc(doc(db, 'statementsSubscribe', id), data));
	const drop = (id) => seed(env, (db) => deleteDoc(doc(db, 'statementsSubscribe', id)));

	before(async () => {
		env = await makeEnv('subscription-access-shapes');
		await seed(env, async (db) => {
			for (const [id, data] of Object.entries(STATEMENTS)) {
				await setDoc(doc(db, 'statements', id), data);
				await setDoc(doc(db, 'statementsSubscribe', `${ADMIN}--${id}`), SHAPES.main(ADMIN, id, 'admin'));
			}
		});
	});

	beforeEach(async () => {
		for (const id of Object.keys(STATEMENTS)) await drop(`${NEW}--${id}`);
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('(a) legacy docs, updated by their owner on an unrelated field', () => {
		it('no statementId: allowed', async () => {
			await put(`${S1}--open`, { userId: S1, role: 'member', lastUpdate: T0 });
			await assertSucceeds(updateDoc(ref(S1, `${S1}--open`), { lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref(S1, `${S1}--open`), { getInAppNotification: false }));
		});

		it('no role: refused (as before: the role checks error on a doc without one)', async () => {
			await put(`${S1}--open`, { ...ids(S1, 'open'), lastUpdate: T0 });
			await assertFails(updateDoc(ref(S1, `${S1}--open`), { lastUpdate: T0 + 1 }));
		});

		it('neither statementId nor role: refused', async () => {
			await put(`${S1}--open`, { userId: S1, lastUpdate: T0 });
			await assertFails(updateDoc(ref(S1, `${S1}--open`), { lastUpdate: T0 + 1 }));
		});

		it('no userId: refused to its owner (isSubscriber reads userId)', async () => {
			await put(`${S1}--open`, { statementId: 'open', role: 'member', lastUpdate: T0 });
			await assertFails(updateDoc(ref(S1, `${S1}--open`), { lastUpdate: T0 + 1 }));
		});
	});

	describe('(b) self-join and role moves under every access', () => {
		const joins = [
			['open', 'member', true],
			['pub', 'member', true],
			['reg', 'member', true],
			['mod', 'member', false],
			['mod', 'waiting', true],
			['none', 'member', false],
			['none', 'waiting', false],
			['inheritTop', 'member', true],
			['inheritTopMod', 'member', false],
			// The rules on dev REFUSE this one only by running out of the expression budget
			// (four getAccess() walks); their logic allows it, and so do the current rules.
			['inheritTopMod', 'waiting', true],
			['inHome', 'member', true],
			['open', 'unsubscribed', true],
			['open', 'admin', false],
			['open', 'creator', false],
		];
		for (const [sid, role, ok] of joins) {
			it(`create on ${sid} as ${role}: ${ok ? 'allowed' : 'refused'}`, async () => {
				const write = setDoc(ref(NEW, `${NEW}--${sid}`), SHAPES.main(NEW, sid, role));
				await (ok ? assertSucceeds(write) : assertFails(write));
			});
		}

		const moves = [
			['open', 'waiting', 'member', true],
			['pub', 'waiting', 'member', true],
			['reg', 'waiting', 'member', true],
			['mod', 'waiting', 'member', false],
			['mod', 'member', 'waiting', true],
			['none', 'waiting', 'member', false],
			['inheritTop', 'waiting', 'member', true],
			['inheritTopMod', 'member', 'waiting', true],
			// Same: refused on dev by the expression budget, allowed by the logic and now.
			['inHome', 'waiting', 'member', true],
			['open', 'member', 'admin', false],
		];
		for (const [sid, from, to, ok] of moves) {
			it(`role move on ${sid}: ${from} -> ${to}: ${ok ? 'allowed' : 'refused'}`, async () => {
				await put(`${S1}--${sid}`, SHAPES.main(S1, sid, from));
				const write = updateDoc(ref(S1, `${S1}--${sid}`), { role: to, lastUpdate: T0 + 1 });
				await (ok ? assertSucceeds(write) : assertFails(write));
			});
		}
	});

	describe('(c) banned members', () => {
		it('cannot move themselves back to member, but may update an unrelated field', async () => {
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'banned'));
			await assertFails(updateDoc(ref(S1, `${S1}--open`), { role: 'member' }));
			await assertSucceeds(updateDoc(ref(S1, `${S1}--open`), { lastUpdate: T0 + 1 }));
		});
	});

	describe('(d) the shapes other apps write: create, then update', () => {
		const shapes = [
			['main', 'member', NEW, true],
			['classStudent', 'member', NEW, true],
			['sign', 'member', NEW, true],
			['studio', 'creator', NEW, false],
			['studio', 'creator', OWNER, true],
		];
		for (const [shape, role, actor, ok] of shapes) {
			it(`${shape} (${role}) created by ${actor === OWNER ? 'the creator' : 'a newcomer'}: ${ok ? 'allowed' : 'refused'}`, async () => {
				await drop(`${actor}--open`);
				const write = setDoc(ref(actor, `${actor}--open`), SHAPES[shape](actor, 'open', role));
				await (ok ? assertSucceeds(write) : assertFails(write));
			});
		}

		for (const shape of ['main', 'classStudent', 'sign']) {
			it(`${shape}: identity fast path (name, flags) allowed; changing user to someone else, userId or statementId refused`, async () => {
				await put(`${S1}--open`, SHAPES[shape](S1, 'open', 'member'));
				const r = ref(S1, `${S1}--open`);
				await assertSucceeds(updateDoc(r, { 'user.displayName': 'New', lastUpdate: T0 + 1 }));
				await assertSucceeds(updateDoc(r, { getInAppNotification: true, statementId: 'open', lastUpdate: T0 + 2 }));
				await assertSucceeds(updateDoc(r, { user: user(S1) }));
				await assertFails(updateDoc(r, { user: user(S2) }));
				await assertFails(updateDoc(r, { userId: S2 }));
				await assertFails(updateDoc(r, { statementId: 'pub' }));
				// dropping the user map is refused too (user.uid must stay or become userId)
				await assertFails(updateDoc(r, { user: deleteField() }));
			});
		}

		it('other app update shapes by the owner: read mark, bookmark, frequency, join order, isDocument', async () => {
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'member'));
			const r = ref(S1, `${S1}--open`);
			await assertSucceeds(updateDoc(r, { lastReadTimestamp: T0 + 1, statementId: 'open', seenMessageCount: 2 }));
			await assertSucceeds(updateDoc(r, { isBookmarked: true, statementId: 'open', lastUpdate: T0 + 2 }));
			await assertSucceeds(updateDoc(r, { 'branchPreferences.b1': { frequency: 'daily', lastNotifiedAt: 0 }, lastUpdate: T0 + 3 }));
			await assertSucceeds(updateDoc(r, { notificationFrequency: 'weekly', lastUpdate: T0 + 4 }));
			await assertSucceeds(updateDoc(r, { joinOrder: 2, lastUpdate: T0 + 5 }));
			await assertSucceeds(updateDoc(r, { openedInJoin: deleteField(), joinOrder: deleteField(), lastUpdate: T0 + 6 }));
			await assertSucceeds(updateDoc(r, { isDocument: true, lastUpdate: T0 + 7 }));
		});
	});

	describe('authority', () => {
		it('a member cannot promote themselves or write another user\'s subscription', async () => {
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'member'));
			await assertFails(updateDoc(ref(S1, `${S1}--open`), { role: 'admin' }));
			await assertFails(updateDoc(ref(S2, `${S1}--open`), { lastUpdate: T0 + 1 }));
			await assertFails(updateDoc(ref(null, `${S1}--open`), { lastUpdate: T0 + 1 }));
		});

		it('an admin updates a member\'s role (approve, ban) but not an admin\'s to banned', async () => {
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'waiting'));
			await assertSucceeds(updateDoc(ref(ADMIN, `${S1}--open`), { role: 'member', lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref(ADMIN, `${S1}--open`), { role: 'banned', statementId: 'open', lastUpdate: T0 + 2 }));
			await put(`${S2}--open`, SHAPES.main(S2, 'open', 'admin'));
			await assertFails(updateDoc(ref(ADMIN, `${S2}--open`), { role: 'banned' }));
		});

		it('nobody, an admin included, creates a subscription for someone else', async () => {
			await assertFails(setDoc(ref(ADMIN, `${NEW}--open`), SHAPES.main(NEW, 'open', 'member')));
			await assertFails(setDoc(ref(OWNER, `${NEW}--open`), SHAPES.main(NEW, 'open', 'member')));
		});

		it('delete: the owner and an admin may, another member may not; on a class home only the owner', async () => {
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'member'));
			await assertFails(deleteDoc(ref('u-s3', `${S1}--open`)));
			await assertSucceeds(deleteDoc(ref(ADMIN, `${S1}--open`)));
			await put(`${S1}--open`, SHAPES.main(S1, 'open', 'member'));
			await assertSucceeds(deleteDoc(ref(S1, `${S1}--open`)));
			await put(`${S1}--home`, SHAPES.main(S1, 'home', 'member'));
			await assertFails(deleteDoc(ref(ADMIN, `${S1}--home`)));
			await assertSucceeds(deleteDoc(ref(S1, `${S1}--home`)));
		});
	});
});

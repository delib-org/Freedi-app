import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * statementsSubscribe: a doc's id `{uid}--{statementId}` must match its contents.
 * Every admin check finds a subscription by its doc id; the access checks read
 * its fields. A doc whose fields name another statement than its id (way A), or
 * an update that moves statementId / userId / user.uid (way B), would make the
 * writer admin of a statement they have no right to. Every client builds the id
 * as `${uid}--${statementId}`; these tests pin both the refusals and the shapes
 * the main app, Join and join-class really write.
 */
describe('statementsSubscribe identity', () => {
	let env;

	const T = 'u-teacher-removed';
	const S1 = 'u-student';
	const OWN = 'own-statement';
	const HOME = 'jcClass_class-5';
	const LESSON = 'lesson-5';
	const OPEN_Q = 'open-question';
	const LEGACY = 'legacy-statement';
	const T0 = 1_800_000_000_000;

	const statement = (id, overrides = {}) => ({
		statementId: id,
		statement: id,
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		parents: [],
		creatorId: 'someone-else',
		creator: { uid: 'someone-else', displayName: 'X' },
		membership: { access: 'openToAll' },
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

	before(async () => {
		env = await makeEnv('subscription-identity');
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', OWN),
				statement(OWN, { creatorId: T, creator: { uid: T, displayName: 'T' } }),
			);
			await setDoc(
				doc(db, 'statements', HOME),
				statement(HOME, {
					statementType: 'group',
					creatorId: T,
					creator: { uid: T, displayName: 'T' },
					membership: { access: 'secret' },
					statementSettings: { classHome: { kind: 'class', classId: 'class-5' } },
				}),
			);
			await setDoc(
				doc(db, 'statements', LESSON),
				statement(LESSON, {
					parentId: HOME,
					topParentId: HOME,
					parents: [HOME],
					statementSettings: { lessonPlan: { steps: ['waiting'], stepIndex: 0 } },
				}),
			);
			await setDoc(doc(db, 'statements', OPEN_Q), statement(OPEN_Q));
			await setDoc(doc(db, 'statements', LEGACY), statement(LEGACY));
			await setDoc(doc(db, 'statementsSubscribe', `${T}--${OWN}`), sub(T, OWN, 'admin'));
			// a legacy doc written before statementId was stored
			await setDoc(doc(db, 'statementsSubscribe', `${S1}--${LEGACY}`), {
				userId: S1,
				role: 'member',
				lastUpdate: T0,
			});
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('way A: refuses a home id holding the fields of a statement the writer owns', async () => {
		await assertFails(
			setDoc(doc(as(T), 'statementsSubscribe', `${T}--${HOME}`), {
				...sub(T, OWN, 'admin'),
				statementsSubscribeId: `${T}--${HOME}`,
			}),
		);
	});

	it('way A on a lesson: a student cannot recreate their lesson doc as admin via own fields', async () => {
		await setDoc(
			doc(as(S1), 'statements', 'student-own'),
			statement('student-own', { creatorId: S1, creator: { uid: S1, displayName: 'S' } }),
		);
		await assertFails(
			setDoc(doc(as(S1), 'statementsSubscribe', `${S1}--${LESSON}`), {
				...sub(S1, 'student-own', 'admin'),
				statementsSubscribeId: `${S1}--${LESSON}`,
			}),
		);
	});

	it('refuses a create whose user.uid is someone else', async () => {
		await assertFails(
			setDoc(doc(as(S1), 'statementsSubscribe', `${S1}--${OPEN_Q}`), {
				...sub(S1, OPEN_Q, 'member'),
				user: { uid: 'victim', displayName: 'V' },
			}),
		);
	});

	it('way B: refuses moving statementId, userId or user.uid on update', async () => {
		const ref = doc(as(T), 'statementsSubscribe', `${T}--${OWN}`);
		await assertFails(updateDoc(ref, { statementId: HOME, topParentId: 'other' }));
		await assertFails(updateDoc(ref, { userId: 'someone' }));
		await assertFails(updateDoc(ref, { 'user.uid': 'someone' }));
	});

	it('main-app shapes still pass: subscribe as member, bookmark, read mark, display name', async () => {
		const db = as(S1);
		const ref = doc(db, 'statementsSubscribe', `${S1}--${OPEN_Q}`);
		await assertSucceeds(
			setDoc(
				ref,
				sub(S1, OPEN_Q, 'member', {
					statement: statement(OPEN_Q),
					parentId: 'top',
					statementType: 'question',
					topParentId: OPEN_Q,
					getInAppNotification: true,
				}),
				{ merge: true },
			),
		);
		await assertSucceeds(
			updateDoc(ref, { isBookmarked: true, statementId: OPEN_Q, lastUpdate: T0 + 1 }),
		);
		await assertSucceeds(updateDoc(ref, { lastReadTimestamp: T0 + 2, statementId: OPEN_Q }));
		await assertSucceeds(updateDoc(ref, { 'user.displayName': 'New name' }));
	});

	it('the creator still gets an admin doc on their own statement (main app / Join / join-class)', async () => {
		const db = as(S1);
		await setDoc(
			doc(db, 'statements', 'mine'),
			statement('mine', { creatorId: S1, creator: { uid: S1, displayName: 'S' } }),
		);
		await assertSucceeds(
			setDoc(
				doc(db, 'statementsSubscribe', `${S1}--mine`),
				sub(S1, 'mine', 'admin', { openedInClass: T0 }),
				{ merge: true },
			),
		);
	});

	it('the join-class student join still passes', async () => {
		await assertSucceeds(
			setDoc(
				doc(as(S1), 'statementsSubscribe', `${S1}--${LESSON}`),
				sub(S1, LESSON, 'member', {
					user: { uid: S1, displayName: 'Dana', photoURL: null, isAnonymous: true },
					parentId: HOME,
					topParentId: HOME,
					statementType: 'question',
				}),
				{ merge: true },
			),
		);
		await assertSucceeds(
			updateDoc(doc(as(S1), 'statementsSubscribe', `${S1}--${LESSON}`), { side: 40, camp: 'a' }),
		);
	});

	it('a legacy doc may gain the statementId its id names, never another', async () => {
		const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${LEGACY}`);
		await assertFails(updateDoc(ref, { statementId: OPEN_Q }));
		await assertSucceeds(updateDoc(ref, { statementId: LEGACY, lastUpdate: T0 + 1 }));
	});
});

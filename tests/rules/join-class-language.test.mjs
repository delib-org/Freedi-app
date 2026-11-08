import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * join-class language check before sending (IA 24.3, 24.4):
 *  - a proposal (an option under the challenge question) is created and
 *    re-worded only by classPostProposal / classEditProposal, so no client
 *    may create one or change its text; table-talk answers keep the client path;
 *  - a language flag is read only by an admin of the lesson, written by nobody
 *    on the client except the admin's `seenAt`.
 */
describe('join-class language rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const STUDENT = 'u-student';
	const OTHER_TEACHER = 'u-other-teacher';
	const MAIN = 'main-language';
	const OTHER_MAIN = 'main-other';
	const CH = 'ch-language';
	const GUIDING = 'guiding-language';
	const PROPOSAL = 'prop-lang';
	const ANSWER = 'answer-lang';
	const FLAG = 'flag-1';
	const T0 = 1_800_000_000_000;

	const as = (uid) => env.authenticatedContext(uid).firestore();

	const sub = (uid, mainId, role) => ({
		statementsSubscribeId: `${uid}--${mainId}`,
		userId: uid,
		statementId: mainId,
		role,
		lastUpdate: T0,
		createdAt: T0,
	});

	const option = (id, parentId, uid) =>
		statementDoc({
			statementId: id,
			uid,
			overrides: { parentId, topParentId: MAIN, parents: [MAIN, parentId] },
		});

	const flag = (id, mainId = MAIN) => ({
		flagId: id,
		mainId,
		uid: STUDENT,
		kind: 'proposal',
		text: 'attempted words',
		attempt: 1,
		createdAt: T0,
		expireAt: T0 + 1000,
	});

	before(async () => {
		env = await makeEnv('join-class-language');
		await seed(env, async (db) => {
			const question = (id, parentId, settings) =>
				setDoc(doc(db, 'statements', id), {
					statementId: id,
					parentId,
					topParentId: MAIN,
					statementType: 'question',
					statementSettings: settings,
				});
			await setDoc(doc(db, 'statements', MAIN), {
				statementId: MAIN,
				parentId: 'top',
				topParentId: MAIN,
				statementType: 'question',
				creatorId: TEACHER,
				creator: { uid: TEACHER, displayName: 'T' },
				membership: { access: 'openToAll' },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${MAIN}`), sub(TEACHER, MAIN, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${MAIN}`), sub(STUDENT, MAIN, 'member'));
			await setDoc(
				doc(db, 'statementsSubscribe', `${OTHER_TEACHER}--${OTHER_MAIN}`),
				sub(OTHER_TEACHER, OTHER_MAIN, 'admin'),
			);
			await question(CH, MAIN, { classRole: 'challenge' });
			await question(GUIDING, MAIN, { classRole: 'guiding' });
			await setDoc(doc(db, 'statements', PROPOSAL), option(PROPOSAL, CH, STUDENT));
			await setDoc(doc(db, 'statements', ANSWER), option(ANSWER, GUIDING, STUDENT));
			await setDoc(doc(db, 'classLanguageFlags', FLAG), flag(FLAG));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('proposals', () => {
		it('denies a client creating a proposal under the challenge', async () => {
			await assertFails(setDoc(doc(as(STUDENT), 'statements', 'prop-new'), option('prop-new', CH, STUDENT)));
		});

		it('denies even the teacher creating one from a browser', async () => {
			await assertFails(setDoc(doc(as(TEACHER), 'statements', 'prop-t'), option('prop-t', CH, TEACHER)));
		});

		it('denies the writer changing the text of a proposal', async () => {
			await assertFails(
				updateDoc(doc(as(STUDENT), 'statements', PROPOSAL), { statement: 'rewritten', lastUpdate: T0 + 1 }),
			);
		});

		it('still lets a student create and edit a table-talk answer', async () => {
			await assertSucceeds(setDoc(doc(as(STUDENT), 'statements', 'answer-new'), option('answer-new', GUIDING, STUDENT)));
			await assertSucceeds(
				updateDoc(doc(as(STUDENT), 'statements', ANSWER), { statement: 'better answer', lastUpdate: T0 + 1 }),
			);
		});

		it('still lets a participant join or move the clocks on a proposal', async () => {
			await assertSucceeds(
				updateDoc(doc(as(TEACHER), 'statements', PROPOSAL), { lastUpdate: T0 + 2, lastChildUpdate: T0 + 2 }),
			);
		});
	});

	describe('language flags', () => {
		it("lets the lesson's admin read a flag, by id and by list", async () => {
			await assertSucceeds(getDoc(doc(as(TEACHER), 'classLanguageFlags', FLAG)));
			await assertSucceeds(
				getDocs(query(collection(as(TEACHER), 'classLanguageFlags'), where('mainId', '==', MAIN))),
			);
		});

		it('denies a student, another lesson admin and a signed-out reader', async () => {
			await assertFails(getDoc(doc(as(STUDENT), 'classLanguageFlags', FLAG)));
			await assertFails(
				getDocs(query(collection(as(STUDENT), 'classLanguageFlags'), where('mainId', '==', MAIN))),
			);
			await assertFails(getDoc(doc(as(OTHER_TEACHER), 'classLanguageFlags', FLAG)));
			await assertFails(
				getDocs(query(collection(as(OTHER_TEACHER), 'classLanguageFlags'), where('mainId', '==', MAIN))),
			);
			await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classLanguageFlags', FLAG)));
		});

		it('answers a get of a missing flag without a crash (resource null)', async () => {
			await assertFails(getDoc(doc(as(TEACHER), 'classLanguageFlags', 'no-such-flag')));
		});

		it('denies every client create and delete, even the admin', async () => {
			await assertFails(setDoc(doc(as(TEACHER), 'classLanguageFlags', 'flag-x'), flag('flag-x')));
			await assertFails(setDoc(doc(as(STUDENT), 'classLanguageFlags', 'flag-y'), flag('flag-y')));
			await assertFails(deleteDoc(doc(as(TEACHER), 'classLanguageFlags', FLAG)));
		});

		it('lets the admin set seenAt, and nothing else', async () => {
			await assertSucceeds(updateDoc(doc(as(TEACHER), 'classLanguageFlags', FLAG), { seenAt: T0 + 9 }));
			await assertFails(updateDoc(doc(as(TEACHER), 'classLanguageFlags', FLAG), { text: 'changed' }));
			await assertFails(updateDoc(doc(as(TEACHER), 'classLanguageFlags', FLAG), { seenAt: 'yes' }));
			await assertFails(updateDoc(doc(as(STUDENT), 'classLanguageFlags', FLAG), { seenAt: T0 + 9 }));
			await assertFails(updateDoc(doc(as(OTHER_TEACHER), 'classLanguageFlags', FLAG), { seenAt: T0 + 9 }));
		});
	});
});

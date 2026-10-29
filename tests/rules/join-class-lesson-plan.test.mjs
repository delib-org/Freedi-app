import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
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
 * join-class lesson plans, games and lessons under homes
 * (IA docs/ia/join-class-lesson-plan.md 9.3):
 *  - classPlans/{planId} and classPlans/{planId}/games/{gameId}: owner-scoped.
 *  - a lesson lives under a class/teacher HOME (secret group). Students reach the
 *    lesson by its code and read and write in it as before, but cannot get() the home.
 *  - statementsSubscribe judges a lesson's question by the lesson (parents[1]), not
 *    by the home it sits under.
 *  - no client creates a home, or sets/changes classHome / classLesson.
 *  - an old top-level lesson is unchanged for students and its teacher.
 */
describe('join-class lesson plans and homes', () => {
	let env;

	const OWNER = 'u-teacher';
	const CO = 'u-co-teacher';
	const OTHER = 'u-other-teacher';
	const STUDENT = 'u-student';
	const PLAN = 'plan-1';
	const GAME = 'game-1';
	const HOME = 'jcClass_class-92';
	const LESSON = 'lesson-1';
	const Q = 'q-guiding';
	const CH = 'q-challenge';
	const OLD = 'old-lesson';
	const OLD_Q = 'old-q';
	const CODE = '424242';
	const T0 = 1_800_000_000_000;

	const plan = (planId = PLAN, ownerUid = OWNER) => ({
		planId,
		title: 'Bullying',
		ownerUid,
		createdAt: T0,
		lastUpdate: T0,
	});
	const game = (gameId = GAME, ownerUid = OWNER, planId = PLAN) => ({
		gameId,
		planId,
		ownerUid,
		title: 'Report or keep quiet?',
		order: 0,
		snapshot: { questions: [], paragraphs: [], introVideos: [], settings: {} },
		createdAt: T0,
		lastUpdate: T0,
	});
	const sub = (uid, statementId, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${statementId}`,
		userId: uid,
		statementId,
		role,
		lastUpdate: T0,
		createdAt: T0,
		...extra,
	});
	const lessonPlan = { steps: ['waiting', 'opening'], stepIndex: 0, status: 'live', statusAt: T0 };

	const as = (uid) => env.authenticatedContext(uid).firestore();

	before(async () => {
		env = await makeEnv('join-class-lesson-plan');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'classPlans', PLAN), plan());
			await setDoc(doc(db, 'classPlans', PLAN, 'games', GAME), game());
			await setDoc(doc(db, 'classPlans', 'plan-other'), plan('plan-other', OTHER));

			await setDoc(doc(db, 'statements', HOME), {
				statementId: HOME,
				statement: 'ט׳2',
				statementType: 'group',
				parentId: 'top',
				topParentId: HOME,
				parents: [],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				membership: { access: 'secret' },
				statementSettings: { classHome: { kind: 'class', classId: 'class-92' } },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OWNER}--${HOME}`), sub(OWNER, HOME, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${CO}--${HOME}`), sub(CO, HOME, 'admin'));

			await setDoc(doc(db, 'statements', LESSON), {
				statementId: LESSON,
				statement: 'Report or keep quiet?',
				statementType: 'question',
				parentId: HOME,
				topParentId: HOME,
				parents: [HOME],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				membership: { access: 'openToAll' },
				statementSettings: {
					lessonPlan,
					classCode: CODE,
					classLesson: { planId: PLAN, gameId: GAME, classId: 'class-92', className: 'ט׳2' },
				},
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OWNER}--${LESSON}`), sub(OWNER, LESSON, 'admin'));
			await setDoc(doc(db, 'classCodes', CODE), { mainId: LESSON, createdAt: T0 });
			for (const [id, role] of [
				[Q, 'guiding'],
				[CH, 'challenge'],
			]) {
				await setDoc(doc(db, 'statements', id), {
					statementId: id,
					statement: id,
					statementType: 'question',
					parentId: LESSON,
					topParentId: HOME,
					parents: [HOME, LESSON],
					creatorId: OWNER,
					creator: { uid: OWNER, displayName: 'T' },
					statementSettings: { classRole: role },
				});
			}

			await setDoc(doc(db, 'statements', OLD), {
				statementId: OLD,
				statement: 'An old lesson',
				statementType: 'question',
				parentId: 'top',
				topParentId: OLD,
				parents: [],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				membership: { access: 'openToAll' },
				statementSettings: { lessonPlan, classCode: '111111' },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OWNER}--${OLD}`), sub(OWNER, OLD, 'admin'));
			await setDoc(doc(db, 'statements', OLD_Q), {
				statementId: OLD_Q,
				statement: 'old question',
				statementType: 'question',
				parentId: OLD,
				topParentId: OLD,
				parents: [OLD],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				statementSettings: { classRole: 'guiding' },
			});
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('classPlans', () => {
		it('lets the owner create, read, list and rename a plan', async () => {
			const db = as(OWNER);
			await assertSucceeds(setDoc(doc(db, 'classPlans', 'plan-new'), plan('plan-new')));
			await assertSucceeds(getDoc(doc(db, 'classPlans', PLAN)));
			await assertSucceeds(getDocs(query(collection(db, 'classPlans'), where('ownerUid', '==', OWNER))));
			await assertSucceeds(updateDoc(doc(db, 'classPlans', PLAN), { title: 'Cyber', lastUpdate: T0 + 1 }));
		});

		it('refuses another teacher reading, listing, updating; a plan for someone else; every delete', async () => {
			const other = as(OTHER);
			await assertFails(getDoc(doc(other, 'classPlans', PLAN)));
			await assertFails(getDocs(query(collection(other, 'classPlans'), where('ownerUid', '==', OWNER))));
			await assertFails(getDocs(collection(other, 'classPlans')));
			await assertFails(updateDoc(doc(other, 'classPlans', PLAN), { title: 'Hijack' }));
			await assertFails(setDoc(doc(other, 'classPlans', 'plan-x'), plan('plan-x', OWNER)));
			await assertFails(setDoc(doc(other, 'classPlans', 'plan-y'), plan('mismatch', OTHER)));
			await assertFails(setDoc(doc(other, 'classPlans', 'plan-z'), { ...plan('plan-z', OTHER), extra: 1 }));
			await assertFails(updateDoc(doc(as(OWNER), 'classPlans', PLAN), { ownerUid: OTHER }));
			await assertFails(deleteDoc(doc(as(OWNER), 'classPlans', PLAN)));
			await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classPlans', PLAN)));
		});
	});

	describe('classPlans/{planId}/games', () => {
		it('lets the owner add, read, list and edit games of their plan', async () => {
			const db = as(OWNER);
			await assertSucceeds(setDoc(doc(db, 'classPlans', PLAN, 'games', 'game-2'), game('game-2')));
			await assertSucceeds(getDoc(doc(db, 'classPlans', PLAN, 'games', GAME)));
			await assertSucceeds(
				getDocs(query(collection(db, 'classPlans', PLAN, 'games'), where('ownerUid', '==', OWNER))),
			);
			await assertSucceeds(
				updateDoc(doc(db, 'classPlans', PLAN, 'games', GAME), {
					title: 'Tell or not?',
					snapshot: { questions: [{ key: 'a', text: 'Why?', order: 0 }], paragraphs: [], introVideos: [], settings: {} },
					lastUpdate: T0 + 1,
				}),
			);
		});

		it('refuses a game in another teacher\'s plan, even owned by the caller', async () => {
			const other = as(OTHER);
			await assertFails(setDoc(doc(other, 'classPlans', PLAN, 'games', 'g-x'), game('g-x', OTHER)));
			await assertFails(setDoc(doc(as(OWNER), 'classPlans', 'plan-other', 'games', 'g-y'), game('g-y', OWNER, 'plan-other')));
		});

		it('refuses another teacher reading or editing a game, bad shapes and deletes', async () => {
			const other = as(OTHER);
			await assertFails(getDoc(doc(other, 'classPlans', PLAN, 'games', GAME)));
			await assertFails(getDocs(collection(other, 'classPlans', PLAN, 'games')));
			await assertFails(updateDoc(doc(other, 'classPlans', PLAN, 'games', GAME), { title: 'x' }));
			const owner = as(OWNER);
			await assertFails(setDoc(doc(owner, 'classPlans', PLAN, 'games', 'g-bad'), { ...game('g-bad'), classCode: '1' }));
			await assertFails(setDoc(doc(owner, 'classPlans', PLAN, 'games', 'g-mis'), game('other-id')));
			await assertFails(updateDoc(doc(owner, 'classPlans', PLAN, 'games', GAME), { ownerUid: OTHER }));
			await assertFails(deleteDoc(doc(owner, 'classPlans', PLAN, 'games', GAME)));
		});
	});

	describe('a student with the code', () => {
		it('resolves the code and reads the lesson, its questions and the list of them', async () => {
			const db = as(STUDENT);
			await assertSucceeds(getDoc(doc(db, 'classCodes', CODE)));
			await assertSucceeds(getDoc(doc(db, 'statements', LESSON)));
			await assertSucceeds(getDoc(doc(db, 'statements', Q)));
			await assertSucceeds(getDocs(query(collection(db, 'statements'), where('parentId', '==', LESSON))));
			await assertSucceeds(
				getDocs(query(collection(db, 'statements'), where('parents', 'array-contains', LESSON))),
			);
		});

		it('cannot get the home, signed in or not', async () => {
			await assertFails(getDoc(doc(as(STUDENT), 'statements', HOME)));
			await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'statements', HOME)));
		});

		it('subscribes to the lesson and to its questions (judged by the lesson), never to the home', async () => {
			const db = as(STUDENT);
			await assertSucceeds(
				setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${LESSON}`), sub(STUDENT, LESSON, 'member', { openedInClass: T0 })),
			);
			await assertSucceeds(
				setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${Q}`), sub(STUDENT, Q, 'member')),
			);
			await assertFails(
				setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${HOME}`), sub(STUDENT, HOME, 'member')),
			);
			await assertSucceeds(
				updateDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${LESSON}`), { side: 70, camp: 'b' }),
			);
		});

		it('writes a table-talk answer under a guiding question, as today', async () => {
			await assertSucceeds(
				setDoc(doc(as(STUDENT), 'statements', 'ans-1'), {
					statementId: 'ans-1',
					statement: 'my answer',
					statementType: 'option',
					parentId: Q,
					topParentId: HOME,
					parents: [HOME, LESSON, Q],
					creatorId: STUDENT,
					creator: { uid: STUDENT, displayName: 'S', isAnonymous: true },
					createdAt: T0,
					lastUpdate: T0,
					consensus: 0,
				}),
			);
		});

		it('still cannot post a proposal directly (classPostProposal only)', async () => {
			await assertFails(
				setDoc(doc(as(STUDENT), 'statements', 'prop-1'), {
					statementId: 'prop-1',
					statement: 'my proposal',
					statementType: 'option',
					parentId: CH,
					topParentId: HOME,
					parents: [HOME, LESSON, CH],
					creatorId: STUDENT,
					creator: { uid: STUDENT, displayName: 'S' },
				}),
			);
		});
	});

	describe('homes and lesson links are server-only', () => {
		it('refuses a client creating a home id or a statement carrying classHome / classLesson', async () => {
			const db = as(OTHER);
			const base = (id, settings = {}) => ({
				statementId: id,
				statement: 'x',
				statementType: 'group',
				parentId: 'top',
				topParentId: id,
				creatorId: OTHER,
				creator: { uid: OTHER, displayName: 'O' },
				statementSettings: settings,
			});
			await assertFails(setDoc(doc(db, 'statements', `jcTeacher_${OWNER}`), base(`jcTeacher_${OWNER}`)));
			await assertFails(setDoc(doc(db, 'statements', 'jcClass_x'), base('jcClass_x')));
			await assertFails(setDoc(doc(db, 'statements', 's-home'), base('s-home', { classHome: { kind: 'teacher', uid: OTHER } })));
			await assertFails(
				setDoc(doc(db, 'statements', 's-lesson'), base('s-lesson', { classLesson: { planId: 'p', gameId: 'g', className: '' } })),
			);
			await assertSucceeds(setDoc(doc(db, 'statements', 's-plain'), base('s-plain', { lessonPlan })));
		});

		it('refuses even the teacher changing classHome or classLesson', async () => {
			await assertFails(
				updateDoc(doc(as(OWNER), 'statements', HOME), { 'statementSettings.classHome.classId': 'other' }),
			);
			await assertFails(
				updateDoc(doc(as(OWNER), 'statements', LESSON), { 'statementSettings.classLesson.gameId': 'other' }),
			);
		});
	});

	describe('teachers', () => {
		it('the class\'s teachers get the home; another teacher does not', async () => {
			await assertSucceeds(getDoc(doc(as(OWNER), 'statements', HOME)));
			await assertSucceeds(getDoc(doc(as(CO), 'statements', HOME)));
			await assertFails(getDoc(doc(as(OTHER), 'statements', HOME)));
		});

		it('the owner and a co-teacher (admin of the home only) run the lesson', async () => {
			await assertSucceeds(
				updateDoc(doc(as(OWNER), 'statements', LESSON), { 'statementSettings.lessonPlan.stepIndex': 1 }),
			);
			await assertSucceeds(
				updateDoc(doc(as(CO), 'statements', LESSON), { 'statementSettings.lessonPlan.stepIndex': 0 }),
			);
			await assertFails(
				updateDoc(doc(as(OTHER), 'statements', LESSON), { 'statementSettings.lessonPlan.stepIndex': 2 }),
			);
		});

		it('the owner renames the home in the main app', async () => {
			await assertSucceeds(updateDoc(doc(as(OWNER), 'statements', HOME), { statement: 'ט׳2 (2026)' }));
		});
	});

	describe('an old top-level lesson is unchanged', () => {
		it('students read it, its question, and subscribe to both', async () => {
			const db = as(STUDENT);
			await assertSucceeds(getDoc(doc(db, 'statements', OLD)));
			await assertSucceeds(getDoc(doc(db, 'statements', OLD_Q)));
			await assertSucceeds(setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${OLD}`), sub(STUDENT, OLD, 'member')));
			await assertSucceeds(setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${OLD_Q}`), sub(STUDENT, OLD_Q, 'member')));
		});

		it('its teacher runs it; another teacher cannot', async () => {
			await assertSucceeds(
				updateDoc(doc(as(OWNER), 'statements', OLD), { 'statementSettings.lessonPlan.stepIndex': 1 }),
			);
			await assertFails(
				updateDoc(doc(as(OTHER), 'statements', OLD), { 'statementSettings.lessonPlan.stepIndex': 2 }),
			);
		});
	});
});

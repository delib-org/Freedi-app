import type {
	ClassGameSnapshot,
	ClassStartLessonRequest,
	ClassTable,
	Statement,
	User,
} from '@freedi/shared-types';
import { startLesson } from '../fn_classStartLesson';
import { snapshotGame } from '../fn_classSnapshotGame';
import { setLessonStatus } from '../fn_classSetLessonStatus';
import { isLesson } from '../cloneLesson';
import { loadMain, requireId } from '../classroomAccess';
import { revokeClassHomeTeacher } from '../classHome';
import {
	autoEvaluatorUids,
	isInLesson,
	onClassOptionCreated,
	shouldLockWriting,
} from '../autoEvaluations';
import { ClassroomError } from '../classroomErrors';
import type { StartLessonDeps } from '../startLesson';
import { FakeFirestore } from './fakeFirestore';

const TEACHER: User = { uid: 'teacher', displayName: 'Tal' };
const CO = 'co-teacher';
const OTHER = 'other';
const NOW = 1_800_000_000_000;
const PLAN = 'plan1';
const GAME = 'game1';
const CLASS = 'class92';
const CLASS_HOME = `jcClass_${CLASS}`;
const TEACHER_HOME = `jcTeacher_${TEACHER.uid}`;
const NEW = 'lesson1';

const SNAPSHOT: ClassGameSnapshot = {
	questions: [
		{ key: 'a', text: 'Why?', order: 0, classRole: 'guiding' },
		{ key: 'b', text: 'Report or keep quiet?', order: 1, classRole: 'challenge' },
	],
	paragraphs: [{ key: 'p', text: 'Intro', order: 0 }],
	introVideos: [],
	settings: { tableSize: 4 },
	sideNames: { a: 'Dana', b: 'Omer' },
};

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

function deps(prefix = 'id', code = 0.25): StartLessonDeps {
	let i = 0;

	return {
		now: () => NOW,
		random: () => code,
		newId: () => `${prefix}${++i}`,
		resolveUsers: async (uids) => uids.map((uid) => ({ uid, displayName: `name-${uid}` })),
	};
}

function seedPlanAndGame(
	fake: FakeFirestore,
	owner = TEACHER.uid,
	snapshot: unknown = SNAPSHOT,
): void {
	fake.seed(`classPlans/${PLAN}`, {
		planId: PLAN,
		title: 'Bullying',
		ownerUid: owner,
		createdAt: 1,
		lastUpdate: 1,
	});
	fake.seed(`classPlans/${PLAN}/games/${GAME}`, {
		gameId: GAME,
		planId: PLAN,
		ownerUid: owner,
		title: 'Report or keep quiet?',
		order: 0,
		snapshot,
		createdAt: 1,
		lastUpdate: 1,
	});
}

function seedClass(fake: FakeFirestore, status = 'active', teacherIds = [TEACHER.uid, CO]): void {
	fake.seed(`agoraClasses/${CLASS}`, {
		classId: CLASS,
		schoolId: 's1',
		name: 'ט׳2',
		teacherIds,
		teacherMap: Object.fromEntries(teacherIds.map((t) => [t, true])),
		classCode: 'ABCDEF',
		memberCount: 0,
		status,
		createdBy: 'admin',
		createdAt: 1,
		lastUpdate: 1,
	});
}

const req = (overrides: Partial<ClassStartLessonRequest> = {}): ClassStartLessonRequest => ({
	planId: PLAN,
	gameId: GAME,
	classId: CLASS,
	newMainId: NEW,
	...overrides,
});

describe('classStartLesson', () => {
	it('creates the class home, its admins, the class link, the lesson tree and the code', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake);
		const res = await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		expect(res).toEqual({ mainId: NEW, classCode: '222222', homeId: CLASS_HOME, reused: false });

		expect(fake.read(`statements/${CLASS_HOME}`)).toMatchObject({
			statementId: CLASS_HOME,
			statement: 'ט׳2',
			statementType: 'group',
			parentId: 'top',
			topParentId: CLASS_HOME,
			parents: [],
			creatorId: TEACHER.uid,
			membership: { access: 'secret' },
			statementSettings: { classHome: { kind: 'class', classId: CLASS } },
		});
		for (const uid of [TEACHER.uid, CO]) {
			expect(fake.read(`statementsSubscribe/${uid}--${CLASS_HOME}`)).toMatchObject({
				role: 'admin',
				userId: uid,
				user: { uid },
				statementId: CLASS_HOME,
				topParentId: CLASS_HOME,
				parentId: 'top',
			});
		}
		expect(fake.read(`agoraClasses/${CLASS}`)).toMatchObject({
			joinClassHomeId: CLASS_HOME,
			name: 'ט׳2',
			teacherIds: [TEACHER.uid, CO],
		});

		const lesson = fake.read(`statements/${NEW}`) as unknown as Statement;
		expect(lesson).toMatchObject({
			statement: 'Report or keep quiet?',
			statementType: 'question',
			parentId: CLASS_HOME,
			topParentId: CLASS_HOME,
			parents: [CLASS_HOME],
			membership: { access: 'openToAll' },
			statementSettings: {
				classCode: '222222',
				lessonPlan: { stepIndex: 0, status: 'live' },
				classLesson: { planId: PLAN, gameId: GAME, classId: CLASS, className: 'ט׳2' },
				tableSize: 4,
				sideNames: { a: 'Dana', b: 'Omer' },
			},
		});
		expect(isLesson(lesson)).toBe(true);
		const children = fake.list('statements').filter((s) => s.parentId === NEW);
		expect(children).toHaveLength(3);
		for (const c of children) {
			expect(c.topParentId).toBe(CLASS_HOME);
			expect(c.parents).toEqual([CLASS_HOME, NEW]);
		}
		expect(fake.read('classCodes/222222')).toEqual({ mainId: NEW, createdAt: NOW });
	});

	it('is idempotent on newMainId and reuses the home on the next lesson', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake);
		await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		const count = fake.list('statements').length;
		expect(await startLesson(fake.asFirestore(), TEACHER, req(), deps())).toEqual({
			mainId: NEW,
			classCode: '222222',
			homeId: CLASS_HOME,
			reused: true,
		});
		expect(fake.list('statements')).toHaveLength(count);

		const second = await startLesson(
			fake.asFirestore(),
			TEACHER,
			req({ newMainId: 'lesson2' }),
			deps('second', 0.35),
		);
		expect(second).toMatchObject({ homeId: CLASS_HOME, classCode: '333333', reused: false });
		// one home, two lessons + their 3 children each
		expect(fake.list('statements').filter((s) => s.statementId === CLASS_HOME)).toHaveLength(1);
		expect(fake.list('statements')).toHaveLength(count + 4);
	});

	it('re-syncs a teacher added to the class later, and keeps an existing admin as is', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake, 'active', [TEACHER.uid]);
		await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		expect(fake.read(`statementsSubscribe/${CO}--${CLASS_HOME}`)).toBeUndefined();
		fake.seed(`statementsSubscribe/${TEACHER.uid}--${CLASS_HOME}`, {
			...fake.read(`statementsSubscribe/${TEACHER.uid}--${CLASS_HOME}`),
			isBookmarked: true,
		});
		seedClass(fake, 'active', [TEACHER.uid, CO]);
		await startLesson(
			fake.asFirestore(),
			TEACHER,
			req({ newMainId: 'lesson2' }),
			deps('second', 0.35),
		);
		expect(fake.read(`statementsSubscribe/${CO}--${CLASS_HOME}`)).toMatchObject({ role: 'admin' });
		expect(fake.read(`statementsSubscribe/${TEACHER.uid}--${CLASS_HOME}`)).toMatchObject({
			isBookmarked: true,
		});
	});

	it('puts a lesson with no class under the teacher home', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		const res = await startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps());
		expect(res.homeId).toBe(TEACHER_HOME);
		expect(fake.read(`statements/${TEACHER_HOME}`)).toMatchObject({
			statement: 'Tal',
			statementSettings: { classHome: { kind: 'teacher', uid: TEACHER.uid } },
			membership: { access: 'secret' },
		});
		expect(fake.read(`statements/${NEW}`)?.statementSettings).toMatchObject({
			classLesson: { planId: PLAN, gameId: GAME, classId: null, className: '' },
		});
	});

	it("refuses a plan or game that is not the caller's, before anything is written", async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake, OTHER);
		seedClass(fake);
		await expectCode(startLesson(fake.asFirestore(), TEACHER, req(), deps()), 'permission-denied');
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ planId: 'nope' }), deps()),
			'not-found',
		);
		expect(fake.list('statements')).toHaveLength(0);
	});

	it('refuses a game the plan does not hold and a game of another owner under my plan', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		fake.seed(`classPlans/${PLAN}/games/foreign`, {
			gameId: 'foreign',
			planId: PLAN,
			ownerUid: OTHER,
			title: 'x',
			order: 1,
			snapshot: SNAPSHOT,
			createdAt: 1,
			lastUpdate: 1,
		});
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ gameId: 'missing' }), deps()),
			'not-found',
		);
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ gameId: 'foreign', classId: null }), deps()),
			'permission-denied',
		);
	});

	it('refuses a class the caller does not teach, an archived class and a missing class', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake, 'active', [OTHER]);
		await expectCode(startLesson(fake.asFirestore(), TEACHER, req(), deps()), 'permission-denied');
		seedClass(fake, 'archived');
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req(), deps()),
			'failed-precondition',
		);
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: 'nope' }), deps()),
			'not-found',
		);
		expect(fake.list('statements')).toHaveLength(0);
	});

	it('refuses a squatted home id and a taken lesson id', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake);
		fake.seed(`statements/${CLASS_HOME}`, {
			statementId: CLASS_HOME,
			parentId: 'top',
			creatorId: OTHER,
		});
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req(), deps()),
			'failed-precondition',
		);
		fake.seed(`statements/${NEW}`, { statementId: NEW, creatorId: OTHER });
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps()),
			'already-exists',
		);
	});

	it('refuses a home id as the lesson id, so no caller can squat a home (B)', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake);
		for (const id of ['jcTeacher_victim', `jcClass_${CLASS}`, TEACHER_HOME]) {
			await expectCode(
				startLesson(fake.asFirestore(), TEACHER, req({ newMainId: id, classId: null }), deps()),
				'invalid-argument',
			);
		}
		expect(fake.list('statements')).toHaveLength(0);
		expect(() => requireId('jcClass_x', 'proposalId')).toThrow(ClassroomError);
		expect(requireId('lesson-1', 'mainId')).toBe('lesson-1');
	});

	it('refuses a pre-existing home made by someone else, even with a matching classHome (A)', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake);
		const squat = (id: string, link: Record<string, unknown>) =>
			fake.seed(`statements/${id}`, {
				statementId: id,
				parentId: 'top',
				topParentId: id,
				creatorId: OTHER,
				creator: { uid: OTHER, displayName: 'x' },
				statementSettings: { classHome: link },
			});
		squat(TEACHER_HOME, { kind: 'teacher', uid: TEACHER.uid });
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps()),
			'failed-precondition',
		);
		squat(CLASS_HOME, { kind: 'class', classId: CLASS });
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req(), deps()),
			'failed-precondition',
		);
		expect(fake.read(`statements/${NEW}`)).toBeUndefined();
	});

	it('accepts a genuine class home made by a teacher since removed (the class links it)', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake, 'active', [TEACHER.uid, CO]);
		await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		// the creator leaves; CO now starts a lesson in the same home
		seedClass(fake, 'active', [CO]);
		fake.seed(`agoraClasses/${CLASS}`, {
			...fake.read(`agoraClasses/${CLASS}`),
			joinClassHomeId: CLASS_HOME,
		});
		fake.seed(`classPlans/p2`, {
			planId: 'p2',
			title: 't',
			ownerUid: CO,
			createdAt: 1,
			lastUpdate: 1,
		});
		fake.seed(`classPlans/p2/games/g2`, {
			gameId: 'g2',
			planId: 'p2',
			ownerUid: CO,
			title: 'CO game',
			order: 0,
			snapshot: SNAPSHOT,
			createdAt: 1,
			lastUpdate: 1,
		});
		const res = await startLesson(
			fake.asFirestore(),
			{ uid: CO, displayName: 'Co' },
			{ planId: 'p2', gameId: 'g2', classId: CLASS, newMainId: 'lesson-co' },
			deps('co', 0.35),
		);
		expect(res.homeId).toBe(CLASS_HOME);
	});

	it('re-syncs the home admins to the class teachers and revokes a removed teacher (D)', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake, 'active', [TEACHER.uid, CO]);
		await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		expect(fake.read(`statementsSubscribe/${CO}--${CLASS_HOME}`)?.role).toBe('admin');
		// what setupAdminsForStatement copied onto statements under the home
		fake.seed(`statementsSubscribe/${CO}--${NEW}`, {
			userId: CO,
			statementId: NEW,
			topParentId: CLASS_HOME,
			role: 'admin',
			statement: { statementId: NEW, creatorId: TEACHER.uid },
		});
		fake.seed(`statementsSubscribe/${CO}--co-own`, {
			userId: CO,
			statementId: 'co-own',
			topParentId: CLASS_HOME,
			role: 'admin',
			statement: { statementId: 'co-own', creatorId: CO },
		});
		fake.seed(`statementsSubscribe/s1--${NEW}`, {
			userId: 's1',
			statementId: NEW,
			topParentId: CLASS_HOME,
			role: 'member',
		});
		seedClass(fake, 'active', [TEACHER.uid]);
		await startLesson(
			fake.asFirestore(),
			TEACHER,
			req({ newMainId: 'lesson2' }),
			deps('second', 0.35),
		);
		expect(fake.read(`statementsSubscribe/${CO}--${CLASS_HOME}`)).toBeUndefined();
		expect(fake.read(`statementsSubscribe/${CO}--${NEW}`)).toBeUndefined();
		// their own statement stays theirs; students are never touched
		expect(fake.read(`statementsSubscribe/${CO}--co-own`)?.role).toBe('admin');
		expect(fake.read(`statementsSubscribe/s1--${NEW}`)?.role).toBe('member');
		expect(fake.read(`statementsSubscribe/${TEACHER.uid}--${CLASS_HOME}`)?.role).toBe('admin');
	});

	it("removeClassTeacher's revoke: drops the home admin and its copies; no home, no-op (D)", async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		seedClass(fake, 'active', [TEACHER.uid, CO]);
		expect(await revokeClassHomeTeacher(fake.asFirestore(), CLASS, CO)).toBe(0);
		await startLesson(fake.asFirestore(), TEACHER, req(), deps());
		fake.seed(`statementsSubscribe/${CO}--${NEW}`, {
			userId: CO,
			statementId: NEW,
			topParentId: CLASS_HOME,
			role: 'admin',
			statement: { statementId: NEW, creatorId: TEACHER.uid },
		});
		expect(await revokeClassHomeTeacher(fake.asFirestore(), CLASS, CO)).toBe(2);
		expect(fake.read(`statementsSubscribe/${CO}--${CLASS_HOME}`)).toBeUndefined();
		expect(fake.read(`statementsSubscribe/${CO}--${NEW}`)).toBeUndefined();
		expect(await revokeClassHomeTeacher(fake.asFirestore(), CLASS, CO)).toBe(1);
	});

	it('refuses a broken or oversized game snapshot and bad arguments', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake, TEACHER.uid, { questions: 'nope' });
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps()),
			'failed-precondition',
		);
		seedPlanAndGame(fake, TEACHER.uid, {
			...SNAPSHOT,
			questions: Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, text: 'q', order: i })),
		});
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps()),
			'resource-exhausted',
		);
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ newMainId: 'a/b' }), deps()),
			'invalid-argument',
		);
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: 5 as unknown as string }), deps()),
			'invalid-argument',
		);
	});

	it('gives up when no class code is free', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		fake.seed('classCodes/222222', { mainId: 'x', createdAt: 1 });
		await expectCode(
			startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps()),
			'resource-exhausted',
		);
	});
});

describe('homes are never workspaces', () => {
	it('loadMain and classSetLessonStatus refuse a home', async () => {
		const fake = new FakeFirestore();
		seedPlanAndGame(fake);
		await startLesson(fake.asFirestore(), TEACHER, req({ classId: null }), deps());
		await expectCode(loadMain(fake.asFirestore(), TEACHER_HOME), 'failed-precondition');
		await expectCode(
			setLessonStatus(fake.asFirestore(), TEACHER.uid, { mainId: TEACHER_HOME, action: 'pause' }),
			'invalid-argument',
		);
		const res = await setLessonStatus(
			fake.asFirestore(),
			TEACHER.uid,
			{ mainId: NEW, action: 'pause' },
			() => NOW,
		);
		expect(res.status).toBe('paused');
	});

	it('isLesson no longer needs a top-level lesson', () => {
		const settings = { lessonPlan: { steps: ['waiting'], stepIndex: 0 } };
		expect(isLesson({ parentId: 'top', statementSettings: settings } as unknown as Statement)).toBe(
			true,
		);
		expect(isLesson({ parentId: 'h', statementSettings: settings } as unknown as Statement)).toBe(
			true,
		);
		expect(
			isLesson({
				parentId: 'top',
				statementSettings: { ...settings, classHome: { kind: 'teacher' } },
			} as unknown as Statement),
		).toBe(false);
	});
});

describe('classSnapshotGame', () => {
	function seedOldLesson(fake: FakeFirestore, owner = TEACHER.uid): void {
		fake.seed('statements/old1', {
			statementId: 'old1',
			statement: 'Phones\nat school',
			parentId: 'top',
			topParentId: 'old1',
			statementType: 'question',
			creatorId: owner,
			creator: { uid: owner, displayName: 'T' },
			statementSettings: {
				lessonPlan: { steps: ['waiting'], stepIndex: 3, status: 'ended' },
				classCode: '111111',
				speakSeconds: 90,
			},
		});
		fake.seed('statements/oq1', {
			statementId: 'oq1',
			statement: 'Should phones be banned?',
			parentId: 'old1',
			topParentId: 'old1',
			statementType: 'question',
			order: 0,
			statementSettings: { classRole: 'challenge' },
		});
	}

	it('turns an old lesson into its own plan and a first game (idempotent)', async () => {
		const fake = new FakeFirestore();
		seedOldLesson(fake);
		const run = () =>
			snapshotGame(
				fake.asFirestore(),
				TEACHER.uid,
				{ sourceMainId: 'old1', planId: 'old1', newGameId: 'old1' },
				() => NOW,
			);
		expect(await run()).toEqual({ planId: 'old1', gameId: 'old1', reused: false });
		expect(fake.read('classPlans/old1')).toEqual({
			planId: 'old1',
			title: 'Phones at school',
			ownerUid: TEACHER.uid,
			createdAt: NOW,
			lastUpdate: NOW,
		});
		const game = fake.read('classPlans/old1/games/old1');
		expect(game).toMatchObject({
			gameId: 'old1',
			planId: 'old1',
			ownerUid: TEACHER.uid,
			title: 'Phones at school',
			order: 0,
			sourceMainId: 'old1',
			snapshot: {
				questions: [
					{ key: 'oq1', text: 'Should phones be banned?', order: 0, classRole: 'challenge' },
				],
				settings: { speakSeconds: 90 },
			},
		});
		expect(JSON.stringify(game)).not.toContain('111111');
		expect(await run()).toEqual({ planId: 'old1', gameId: 'old1', reused: true });
	});

	it('adds a game to an existing plan at the end, with the given title', async () => {
		const fake = new FakeFirestore();
		seedOldLesson(fake);
		seedPlanAndGame(fake);
		const res = await snapshotGame(
			fake.asFirestore(),
			TEACHER.uid,
			{ sourceMainId: 'old1', planId: PLAN, newGameId: 'g2', title: 'From last year' },
			() => NOW,
		);
		expect(res.reused).toBe(false);
		expect(fake.read(`classPlans/${PLAN}/games/g2`)).toMatchObject({
			order: 1,
			title: 'From last year',
		});
		expect(fake.read(`classPlans/${PLAN}`)?.lastUpdate).toBe(NOW);
	});

	it('refuses a lesson the caller does not run, a plan of another, a missing plan', async () => {
		const fake = new FakeFirestore();
		seedOldLesson(fake, OTHER);
		await expectCode(
			snapshotGame(fake.asFirestore(), TEACHER.uid, {
				sourceMainId: 'old1',
				planId: 'old1',
				newGameId: 'g',
			}),
			'permission-denied',
		);
		const mine = new FakeFirestore();
		seedOldLesson(mine);
		seedPlanAndGame(mine, OTHER);
		await expectCode(
			snapshotGame(mine.asFirestore(), TEACHER.uid, {
				sourceMainId: 'old1',
				planId: PLAN,
				newGameId: 'g',
			}),
			'permission-denied',
		);
		await expectCode(
			snapshotGame(mine.asFirestore(), TEACHER.uid, {
				sourceMainId: 'old1',
				planId: 'nope',
				newGameId: 'g',
			}),
			'not-found',
		);
	});
});

describe('auto +1 under a class home (autoEvaluations 9.2)', () => {
	const MAIN = NEW;
	const TABLE_ID = `${MAIN}--1`;
	const table: ClassTable = {
		tableId: TABLE_ID,
		mainId: MAIN,
		n: 1,
		memberUids: ['s1', 's2'],
		noDeviceMembers: [],
		step: 'write',
		askerUid: 's1',
		turn: 1,
		questionId: 'q1',
		writingMode: 'table',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		updatedAt: 0,
	};
	const option = {
		statementId: 'opt1',
		statement: 'An answer',
		statementType: 'option',
		parentId: 'q1',
		topParentId: CLASS_HOME,
		parents: [CLASS_HOME, MAIN, 'q1'],
		creatorId: 's1',
		creator: { uid: 's1', displayName: 'Dana', isAnonymous: true },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		classTable: { tableId: TABLE_ID, shared: true, coAuthors: ['s1', 's2'] },
	} as unknown as Statement;

	it('finds the lesson in parents, not in topParentId', () => {
		expect(isInLesson(option, MAIN)).toBe(true);
		expect(isInLesson(option, 'elsewhere')).toBe(false);
		expect(isInLesson({ topParentId: MAIN }, MAIN)).toBe(true);
		expect(isInLesson({ topParentId: MAIN }, '')).toBe(false);
		expect(autoEvaluatorUids(option, table)).toEqual(['s1', 's2']);
		expect(shouldLockWriting(table, option)).toBe(true);
		expect(autoEvaluatorUids({ ...option, parents: [CLASS_HOME, 'other', 'q1'] }, table)).toEqual(
			[],
		);
	});

	it("writes the +1s reading the students' lesson subscriptions, and locks the table", async () => {
		const fake = new FakeFirestore();
		fake.seed(`classTables/${TABLE_ID}`, table as unknown as Record<string, unknown>);
		fake.seed(`statementsSubscribe/s2--${MAIN}`, {
			userId: 's2',
			statementId: MAIN,
			user: { uid: 's2', displayName: 'Omer', isAnonymous: true },
		});
		expect(await onClassOptionCreated(fake.asFirestore(), option)).toBe(2);
		expect(fake.read('evaluations/s2--opt1')).toMatchObject({
			evaluation: 1,
			evaluator: { displayName: 'Omer' },
		});
		expect(fake.read(`classTables/${TABLE_ID}`)?.writingLocked).toBe(true);
	});
});

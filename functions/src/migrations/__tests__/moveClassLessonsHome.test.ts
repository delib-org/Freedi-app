import { describe, it, expect, beforeEach } from '@jest/globals';
import { isTopLevelSubscription } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import {
	LIVE_WINDOW_MS,
	formatMoveReport,
	MIGRATION_BATCH_SIZE,
	OPEN_WINDOW_MS,
	activeSkipReason,
	isLiveLesson,
	lessonMode,
	moveClassLessonsHome,
	movedParents,
} from '../moveClassLessonsHome';

const NOW = 1_800_000_000_000;
const T = 'teacher';
const H = `jcTeacher_${T}`;
const L = 'lesson1';
const LIVE = 'lesson-live';

const plan = (over: Record<string, unknown> = {}) => ({
	steps: ['waiting', 'opening', 'tables'],
	stepIndex: 2,
	status: 'ended',
	...over,
});

function seedWorld(fake: FakeFirestore): void {
	fake.seed(`statements/${L}`, {
		statementId: L,
		statement: 'Phones at school',
		statementType: 'question',
		parentId: 'top',
		topParentId: L,
		parents: [],
		creatorId: T,
		creator: { uid: T, displayName: 'Tal' },
		lastUpdate: NOW - 10 * LIVE_WINDOW_MS,
		statementSettings: { lessonPlan: plan(), classCode: '111111', tableSize: 4 },
	});
	fake.seed('statements/q1', {
		statementId: 'q1',
		statement: 'Should phones be banned?',
		statementType: 'question',
		parentId: L,
		topParentId: L,
		parents: [L],
		order: 0,
		statementSettings: { classRole: 'challenge' },
	});
	fake.seed('statements/o1', {
		statementId: 'o1',
		statement: 'a student proposal',
		statementType: 'option',
		parentId: 'q1',
		topParentId: L,
		parents: [L, 'q1'],
	});
	// a legacy child with no parents array: rebuilt from the chain
	fake.seed('statements/r1', {
		statementId: 'r1',
		statement: 'a reply',
		statementType: 'statement',
		parentId: 'o1',
		topParentId: L,
	});
	fake.seed(`statementsSubscribe/${T}--${L}`, {
		statementsSubscribeId: `${T}--${L}`,
		statementId: L,
		userId: T,
		role: 'admin',
		parentId: 'top',
		topParentId: L,
		openedInClass: NOW - 5,
		statement: { statementId: L, parentId: 'top', topParentId: L, parents: [] },
	});
	fake.seed(`statementsSubscribe/s1--${L}`, {
		statementsSubscribeId: `s1--${L}`,
		statementId: L,
		userId: 's1',
		role: 'member',
		side: 30,
		statement: { statementId: L, parentId: 'top', topParentId: L },
	});
	fake.seed('statementsSubscribe/s1--q1', {
		statementId: 'q1',
		userId: 's1',
		role: 'member',
		parentId: L,
		topParentId: L,
	});
	// a lesson played right now: skipped
	fake.seed(`statements/${LIVE}`, {
		statementId: LIVE,
		statement: 'Live one',
		statementType: 'question',
		parentId: 'top',
		topParentId: LIVE,
		creatorId: T,
		creator: { uid: T, displayName: 'Tal' },
		lastChildUpdate: NOW - 60_000,
		statementSettings: { lessonPlan: plan({ status: 'live', stepIndex: 4 }) },
	});
	// not a lesson, and a lesson already under a home (classStartLesson's)
	fake.seed('statements/plain', {
		statementId: 'plain',
		parentId: 'top',
		topParentId: 'plain',
		statementSettings: {},
	});
	fake.seed('statements/newer', {
		statementId: 'newer',
		statement: 'Newer',
		parentId: H,
		topParentId: H,
		parents: [H],
		creatorId: T,
		statementSettings: {
			lessonPlan: plan(),
			classLesson: { planId: 'p', gameId: 'g', classId: null, className: '' },
		},
	});
}

const noSleep = async (): Promise<void> => undefined;

describe('moveClassLessonsHome helpers', () => {
	it('skips live (waiting room included) and open lessons; moves ended and stale ones', () => {
		const lesson = (settings: Record<string, unknown>, touched: number) =>
			({
				lastUpdate: touched,
				statementSettings: { lessonPlan: plan(settings) },
			}) as unknown as Statement;
		const reason = (settings: Record<string, unknown>, touched: number) =>
			activeSkipReason(lesson(settings, touched), NOW);
		expect(reason({ status: 'live' }, NOW - 1000)).toBe('live');
		expect(reason({ status: undefined }, NOW - 1000)).toBe('live');
		expect(reason({ status: 'paused' }, NOW - 1000)).toBe('live');
		expect(reason({ status: 'live', stepIndex: 0 }, NOW - 1000)).toBe('live');
		expect(reason({ status: 'open' }, NOW - 1000)).toBe('open');
		expect(reason({ status: 'open' }, NOW - OPEN_WINDOW_MS + 1000)).toBe('open');
		expect(reason({ status: 'open' }, NOW - OPEN_WINDOW_MS - 1)).toBeNull();
		expect(reason({ status: 'live' }, NOW - LIVE_WINDOW_MS - 1)).toBeNull();
		expect(reason({ status: 'ended' }, NOW - 1000)).toBeNull();
		expect(isLiveLesson(lesson({ status: 'live', stepIndex: 0 }, NOW - 1000), NOW)).toBe(true);
	});

	it('selects old lessons to move and home lessons only to sweep', () => {
		const s = (over: Record<string, unknown>) => over as unknown as Statement;
		expect(lessonMode(s({ parentId: 'top', statementSettings: { lessonPlan: plan() } }))).toBe(
			'move',
		);
		expect(
			lessonMode(
				s({ parentId: H, statementSettings: { lessonPlan: plan(), classLesson: { planId: 'x' } } }),
			),
		).toBe('sweep');
		expect(lessonMode(s({ parentId: 'top', statementSettings: {} }))).toBeNull();
		expect(
			lessonMode(s({ parentId: 'top', statementSettings: { lessonPlan: plan(), classHome: {} } })),
		).toBeNull();
	});

	it('moves parents under the home, keeps done ones, rebuilds broken ones', () => {
		const byId = new Map<string, Statement>([
			['o1', { statementId: 'o1', parentId: 'q1' } as Statement],
			['q1', { statementId: 'q1', parentId: L } as Statement],
		]);
		const st = (over: Record<string, unknown>) => over as unknown as Statement;
		expect(movedParents(st({ parents: [L, 'q1'] }), L, H, byId)).toEqual([H, L, 'q1']);
		expect(movedParents(st({ parents: [H, L, 'q1'] }), L, H, byId)).toEqual([H, L, 'q1']);
		expect(movedParents(st({ parentId: 'o1' }), L, H, byId)).toEqual([H, L, 'q1', 'o1']);
		expect(movedParents(st({ parentId: 'o1', parents: ['x'] }), L, H, byId)).toEqual([
			H,
			L,
			'q1',
			'o1',
		]);
	});
});

describe('moveClassLessonsHome', () => {
	let fake: FakeFirestore;

	beforeEach(() => {
		fake = new FakeFirestore();
		seedWorld(fake);
	});

	const run = (execute: boolean, extra: Record<string, unknown> = {}) =>
		moveClassLessonsHome(fake.asFirestore(), {
			execute,
			now: () => NOW,
			sleep: noSleep,
			pageSize: 2,
			...extra,
		});

	it('dry run: reports per lesson and totals, writes nothing', async () => {
		const before = JSON.stringify([...fake.docs.entries()]);
		const report = await run(false);
		expect(JSON.stringify([...fake.docs.entries()])).toBe(before);
		const moved = report.lessons.find((l) => l.lessonId === L);
		expect(moved).toMatchObject({
			homeId: H,
			mode: 'move',
			homeToCreate: true,
			descendants: 3,
			descendantsToRewrite: 3,
			subscriptions: 3,
			subscriptionsToRewrite: 3,
			planToCreate: true,
			gameToCreate: true,
		});
		expect(report.lessons.find((l) => l.lessonId === LIVE)?.skipped).toBe('live');
		expect(report.lessons.map((l) => l.lessonId).sort()).toEqual([L, LIVE].sort());
		expect(report.totals).toMatchObject({
			candidates: 2,
			moved: 1,
			skippedLive: 1,
			homesToCreate: 1,
			plansToCreate: 1,
			gamesToCreate: 1,
		});
		expect(formatMoveReport(report)).toContain('SKIPPED: live');
	});

	it('execute: moves the lesson tree, its subscriptions, makes the home, plan and game', async () => {
		await run(true);
		expect(fake.read(`statements/${L}`)).toMatchObject({
			parentId: H,
			topParentId: H,
			parents: [H],
			statementSettings: {
				classCode: '111111',
				classLesson: { planId: L, gameId: L, classId: null, className: '' },
			},
		});
		expect(fake.read('statements/q1')).toMatchObject({
			parentId: L,
			topParentId: H,
			parents: [H, L],
		});
		expect(fake.read('statements/o1')).toMatchObject({ topParentId: H, parents: [H, L, 'q1'] });
		expect(fake.read('statements/r1')).toMatchObject({
			parentId: 'o1',
			topParentId: H,
			parents: [H, L, 'q1', 'o1'],
		});
		expect(fake.read(`statements/${H}`)).toMatchObject({
			statementType: 'group',
			membership: { access: 'secret' },
			statementSettings: { classHome: { kind: 'teacher', uid: T } },
		});
		expect(fake.read(`statementsSubscribe/${T}--${H}`)).toMatchObject({ role: 'admin' });
		// L's own subscriptions keep parentId 'top' and their embedded statement, so
		// isTopLevelSubscription does not flip and the userFeed entries for L survive
		expect(fake.read(`statementsSubscribe/${T}--${L}`)).toMatchObject({
			parentId: 'top',
			topParentId: H,
			openedInClass: NOW - 5,
			statement: { parentId: 'top', topParentId: L, parents: [] },
		});
		expect(isTopLevelSubscription(fake.read(`statementsSubscribe/${T}--${L}`) ?? {})).toBe(true);
		expect(fake.read(`statementsSubscribe/s1--${L}`)).toMatchObject({
			topParentId: H,
			side: 30,
			statement: { parentId: 'top', topParentId: L },
		});
		expect(isTopLevelSubscription(fake.read(`statementsSubscribe/s1--${L}`) ?? {})).toBe(true);
		expect(fake.read('statementsSubscribe/s1--q1')).toMatchObject({ parentId: L, topParentId: H });
		expect(fake.read(`classPlans/${L}`)).toMatchObject({
			planId: L,
			title: 'Phones at school',
			ownerUid: T,
		});
		expect(fake.read(`classPlans/${L}/games/${L}`)).toMatchObject({
			gameId: L,
			planId: L,
			order: 0,
			sourceMainId: L,
			snapshot: { questions: [{ key: 'q1', classRole: 'challenge' }], settings: { tableSize: 4 } },
		});
		// the live lesson and the others are untouched
		expect(fake.read(`statements/${LIVE}`)?.parentId).toBe('top');
		expect(fake.read('statements/newer')?.parentId).toBe(H);
		expect(fake.read('statements/plain')?.parentId).toBe('top');
	});

	it('is idempotent, and the sweep catches a child written with the old topParentId', async () => {
		await run(true);
		const after = JSON.stringify([...fake.docs.entries()]);
		const again = await run(true);
		expect(again.totals.moved).toBe(0);
		expect(JSON.stringify([...fake.docs.entries()])).toBe(after);

		fake.seed('statements/late', {
			statementId: 'late',
			statementType: 'option',
			parentId: 'q1',
			topParentId: L,
			parents: [L, 'q1'],
		});
		const sweep = await run(true, { sweep: true });
		const swept = sweep.lessons.find((l) => l.lessonId === L);
		expect(swept).toMatchObject({
			mode: 'sweep',
			descendantsToRewrite: 1,
			subscriptionsToRewrite: 0,
		});
		expect(fake.read('statements/late')).toMatchObject({ topParentId: H, parents: [H, L, 'q1'] });
		// the classStartLesson lesson is swept too and needs nothing
		expect(sweep.lessons.find((l) => l.lessonId === 'newer')?.descendantsToRewrite).toBe(0);
	});

	it('resumes a run that stopped before the lesson itself was written', async () => {
		// as if a previous run rewrote q1 and created the home, then died
		fake.seed('statements/q1', {
			...fake.read('statements/q1'),
			topParentId: H,
			parents: [H, L],
		});
		const report = await run(true, { onlyLessonId: L });
		expect(report.lessons).toHaveLength(1);
		expect(report.lessons[0].descendantsToRewrite).toBe(2);
		expect(fake.read(`statements/${L}`)?.parentId).toBe(H);
		expect(fake.read('statements/q1')?.parents).toEqual([H, L]);
	});

	it('reports an open lesson and a foreign plan as their own outcomes, writing nothing', async () => {
		fake.seed(`statements/${L}`, {
			...fake.read(`statements/${L}`),
			lastUpdate: NOW - 1000,
			statementSettings: { lessonPlan: plan({ status: 'open' }) },
		});
		const open = await run(true, { onlyLessonId: L });
		expect(open.lessons[0].skipped).toBe('open');
		expect(open.totals.skippedOpen).toBe(1);

		const other = new FakeFirestore();
		seedWorld(other);
		other.seed(`classPlans/${L}`, { planId: L, title: 'mine now', ownerUid: 'squatter' });
		const before = JSON.stringify([...other.docs.entries()]);
		const report = await moveClassLessonsHome(other.asFirestore(), {
			execute: true,
			now: () => NOW,
			sleep: noSleep,
			onlyLessonId: L,
		});
		expect(report.lessons[0].skipped).toBe('plan-foreign');
		expect(report.totals.skippedForeign).toBe(1);
		expect(JSON.stringify([...other.docs.entries()])).toBe(before);
		expect(formatMoveReport(report)).toContain('SKIPPED: plan-foreign');
	});

	it('writes in batches of the given size (default 100)', async () => {
		expect(MIGRATION_BATCH_SIZE).toBe(100);
		const sizes: number[] = [];
		const firestore = fake.asFirestore();
		const realBatch = firestore.batch.bind(firestore);
		(firestore as unknown as { batch: () => unknown }).batch = () => {
			const b = realBatch() as unknown as { commit: () => Promise<void>; size: number };
			const commit = b.commit;

			return Object.assign(b, {
				commit: async () => {
					sizes.push(b.size);
					await commit();
				},
			});
		};
		await moveClassLessonsHome(firestore, {
			execute: true,
			now: () => NOW,
			sleep: noSleep,
			onlyLessonId: L,
			batchSize: 2,
		});
		expect(sizes.length).toBeGreaterThan(1);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
	});

	it('skips a lesson with no teacher and reports a squatted home as an error', async () => {
		fake.seed(`statements/${L}`, {
			...fake.read(`statements/${L}`),
			creatorId: '',
			creator: undefined,
		});
		const noTeacher = await run(false, { onlyLessonId: L });
		expect(noTeacher.lessons[0].skipped).toBe('no-teacher');

		const other = new FakeFirestore();
		seedWorld(other);
		other.seed(`statements/${H}`, {
			statementId: H,
			parentId: 'top',
			creatorId: 'squatter',
			statementSettings: { classHome: { kind: 'teacher', uid: T } },
		});
		const report = await moveClassLessonsHome(other.asFirestore(), {
			execute: true,
			now: () => NOW,
			sleep: noSleep,
			onlyLessonId: L,
		});
		expect(report.lessons[0]).toMatchObject({ skipped: 'home-foreign' });
		expect(other.read(`statements/${L}`)?.parentId).toBe('top');
	});
});

import type { ClassTable } from '@freedi/shared-types';
import { setLessonStatus } from '../fn_classSetLessonStatus';
import { assignTables } from '../fn_classAssignTables';
import { moveStudent } from '../fn_classMoveStudent';
import { addNoDevice } from '../fn_classAddNoDevice';
import { tableStep } from '../fn_classTableStep';
import { allTablesTo } from '../fn_classAllTablesTo';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STUDENT = 's00';
const T0 = 1_800_000_000_000;
const SPEAKER_END = T0 + 60_000;

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

function lessonPlan(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		steps: ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'],
		stepIndex: 3,
		...extra,
	};
}

function seed(plan: Record<string, unknown> | null): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: plan ? { lessonPlan: plan } : {},
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	for (let i = 0; i < 6; i++) {
		const uid = `s${String(i).padStart(2, '0')}`;
		fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
			userId: uid,
			statementId: MAIN,
			role: 'member',
			side: 50,
			camp: 'center',
			createdAt: 1000 + i,
		});
	}

	return fake;
}

async function seatedLesson(plan: Record<string, unknown>): Promise<FakeFirestore> {
	const fake = seed(null);
	await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN, tableSize: 3 });
	fake.seed(`statements/${MAIN}`, {
		...fake.read(`statements/${MAIN}`),
		statementSettings: { lessonPlan: plan },
	});

	return fake;
}

const planOf = (fake: FakeFirestore): Record<string, unknown> =>
	(fake.read(`statements/${MAIN}`)?.statementSettings as { lessonPlan: Record<string, unknown> })
		.lessonPlan;

describe('classSetLessonStatus', () => {
	it('refuses a student and an unknown action', async () => {
		const fake = seed(lessonPlan());
		await expectCode(
			setLessonStatus(fake.asFirestore(), STUDENT, { mainId: MAIN, action: 'pause' }),
			'permission-denied',
		);
		await expectCode(
			setLessonStatus(fake.asFirestore(), TEACHER, { mainId: MAIN, action: 'explode' as 'pause' }),
			'invalid-argument',
		);
	});

	it('refuses a workspace that is not a lesson and an unknown one', async () => {
		const fake = seed(null);
		await expectCode(
			setLessonStatus(fake.asFirestore(), TEACHER, { mainId: MAIN, action: 'pause' }),
			'failed-precondition',
		);
		await expectCode(
			setLessonStatus(fake.asFirestore(), TEACHER, { mainId: 'nope', action: 'pause' }),
			'not-found',
		);
	});

	it('pauses and records pausedAt, statusAt and the plan keeps its step', async () => {
		const fake = seed(lessonPlan());
		const res = await setLessonStatus(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, action: 'pause' },
			() => T0,
		);
		expect(res).toEqual({ status: 'paused', statusAt: T0 });
		expect(planOf(fake)).toMatchObject({
			status: 'paused',
			pausedAt: T0,
			statusAt: T0,
			stepIndex: 3,
		});
	});

	it('resumes: shifts every speakerEndsAt by the pause length and clears pausedAt', async () => {
		const fake = await seatedLesson(lessonPlan({ status: 'paused', pausedAt: T0 }));
		const tableIds = fake.list('classTables').map((t) => (t as unknown as ClassTable).tableId);
		fake.seed(`classTables/${tableIds[0]}`, {
			...fake.read(`classTables/${tableIds[0]}`),
			speakerUid: 's00',
			speakerEndsAt: SPEAKER_END,
		});
		const res = await setLessonStatus(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, action: 'resume' },
			() => T0 + 25_000,
		);
		expect(res.status).toBe('live');
		expect(planOf(fake).pausedAt).toBeUndefined();
		expect(fake.read(`classTables/${tableIds[0]}`)?.speakerEndsAt).toBe(SPEAKER_END + 25_000);
		expect(fake.read(`classTables/${tableIds[1]}`)?.speakerEndsAt).toBeUndefined();
	});

	it('ends, keeps open, and reopens back to live', async () => {
		const fake = seed(lessonPlan());
		const db = fake.asFirestore();
		await setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'keepOpen' }, () => T0);
		expect(planOf(fake)).toMatchObject({ status: 'open', endedAt: T0 });
		await setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'end' }, () => T0 + 5);
		expect(planOf(fake)).toMatchObject({ status: 'ended', endedAt: T0 + 5, stepIndex: 3 });
		await setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'reopen' }, () => T0 + 9);
		expect(planOf(fake)).toMatchObject({ status: 'live', statusAt: T0 + 9, stepIndex: 3 });
	});

	it('answers a repeat as a no-op and an illegal move as failed-precondition', async () => {
		const fake = seed(lessonPlan({ status: 'ended', statusAt: T0, endedAt: T0 }));
		const db = fake.asFirestore();
		const again = await setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'end' }, () => T0 + 1);
		expect(again).toEqual({ status: 'ended', statusAt: T0 });
		await expectCode(
			setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'pause' }),
			'failed-precondition',
		);
		await expectCode(
			setLessonStatus(db, TEACHER, { mainId: MAIN, action: 'keepOpen' }),
			'failed-precondition',
		);
	});
});

describe('table callables while the lesson is not running', () => {
	const cases: Array<[string, Record<string, unknown>]> = [
		['paused', { status: 'paused', pausedAt: T0 }],
		['ended', { status: 'ended', endedAt: T0 }],
	];

	it.each(cases)('classTableStep refuses while %s', async (_name, extra) => {
		const fake = await seatedLesson(lessonPlan(extra));
		const [first] = fake.list('classTables') as unknown as ClassTable[];
		await expectCode(
			tableStep(fake.asFirestore(), TEACHER, { tableId: first.tableId, action: 'toTalk' }),
			'failed-precondition',
		);
	});

	it.each(cases)(
		'classAllTablesTo, classMoveStudent, classAddNoDevice, classAssignTables refuse while %s',
		async (_name, extra) => {
			const fake = await seatedLesson(lessonPlan(extra));
			const db = fake.asFirestore();
			await expectCode(
				allTablesTo(db, TEACHER, { mainId: MAIN, step: 'rate' }),
				'failed-precondition',
			);
			await expectCode(
				moveStudent(db, TEACHER, { mainId: MAIN, uid: STUDENT, toTable: null }),
				'failed-precondition',
			);
			await expectCode(
				addNoDevice(db, TEACHER, { mainId: MAIN, n: 1, name: 'Dana' }),
				'failed-precondition',
			);
			await expectCode(
				assignTables(db, TEACHER, { mainId: MAIN, replace: true }),
				'failed-precondition',
			);
		},
	);

	it('lets live and open lessons through', async () => {
		for (const extra of [{}, { status: 'live' }, { status: 'open', endedAt: T0 }]) {
			const fake = await seatedLesson(lessonPlan(extra));
			const [first] = fake.list('classTables') as unknown as ClassTable[];
			const res = await tableStep(fake.asFirestore(), TEACHER, {
				tableId: first.tableId,
				action: 'toTalk',
			});
			expect(res.step).toBe('talk');
			await expect(
				allTablesTo(fake.asFirestore(), TEACHER, { mainId: MAIN, step: 'rate' }),
			).resolves.toMatchObject({ updated: 2 });
		}
	});
});

import type { ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';
import { assignTables } from '../fn_classAssignTables';
import { lessonSupportBySide } from '../fn_classSupportBySide';
import { sidesOf } from '../classSides';
import { supportStepOpen } from '../supportAccess';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

/**
 * Trello btMVQMM5: the sides are private (classSides/{uid}--{mainId}). The
 * engine reads them with the Admin SDK to mix the tables and to total the
 * support by side; a legacy subscription still holding them fills in until
 * the backfill. Only totals ever leave.
 */

const MAIN = 'main1';
const TEACHER = 'teacher';
const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
const SUMMARY = STEPS.indexOf('summary');
const SIDE_STEP = STEPS.indexOf('side');
const NOW = 1_800_000_000_000;

function fixedRng(): () => number {
	let i = 0;

	return () => ((i++ * 7) % 10) / 10;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

interface Student {
	uid: string;
	side?: number;
	camp?: 'a' | 'center' | 'b';
	support?: number;
	legacy?: boolean;
}

function seedLesson(
	fake: FakeFirestore,
	students: Student[],
	stepIndex = SUMMARY,
	voteDisplay?: object,
): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex } },
	});
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		statementSettings: { classRole: 'challenge', ...(voteDisplay ? { voteDisplay } : {}) },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	for (const s of students) {
		const values = {
			...(s.side !== undefined ? { side: s.side } : {}),
			...(s.camp ? { camp: s.camp } : {}),
			...(s.support !== undefined ? { decisionSupport: s.support } : {}),
		};
		fake.seed(`statementsSubscribe/${s.uid}--${MAIN}`, {
			userId: s.uid,
			statementId: MAIN,
			role: 'member',
			...(s.legacy ? values : { sidePickedAt: NOW }),
		});
		if (!s.legacy) {
			fake.seed(`classSides/${s.uid}--${MAIN}`, {
				userId: s.uid,
				mainId: MAIN,
				...values,
				lastUpdate: NOW,
			});
		}
	}
}

describe('sidesOf', () => {
	it('prefers the private doc and falls back to the legacy subscription', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [
			{ uid: 'p', side: 10, camp: 'a' },
			{ uid: 'l', side: 90, camp: 'b', legacy: true },
		]);
		const subs = fake
			.list('statementsSubscribe')
			.filter((d) => d.role === 'member') as unknown as StatementSubscription[];
		const sides = await sidesOf(fake.asFirestore(), MAIN, subs);
		expect(sides.get('p')).toMatchObject({ side: 10, camp: 'a' });
		expect(sides.get('l')).toMatchObject({ side: 90, camp: 'b' });
	});
});

describe('classAssignTables reads the private sides', () => {
	it('mixes the camps from classSides docs (no side on any subscription)', async () => {
		const fake = new FakeFirestore();
		const students: Student[] = [];
		for (let i = 0; i < 8; i++) {
			students.push({ uid: `s${i}`, side: i % 2 === 0 ? 5 : 95, camp: i % 2 === 0 ? 'a' : 'b' });
		}
		seedLesson(fake, students, SIDE_STEP + 1);
		await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN, tableSize: 4 }, fixedRng());
		const tables = fake.list('classTables') as unknown as ClassTable[];
		expect(tables).toHaveLength(2);
		const campOf = (uid: string): string => (Number(uid.slice(1)) % 2 === 0 ? 'a' : 'b');
		for (const t of tables) {
			const camps = new Set(t.memberUids.map(campOf));
			expect(camps).toEqual(new Set(['a', 'b']));
		}
		for (const s of students) {
			expect(fake.read(`statementsSubscribe/${s.uid}--${MAIN}`)).not.toHaveProperty('camp');
		}
	});
});

describe('classSupportBySide', () => {
	const room: Student[] = [
		{ uid: 'a1', side: 10, camp: 'a', support: 1 },
		{ uid: 'a2', side: 20, camp: 'a' },
		{ uid: 'b1', side: 90, camp: 'b', support: -1, legacy: true },
		{ uid: 'c1', side: 50, camp: 'center', support: 0.5 },
		{ uid: 'none' },
	];

	it('gives the teacher totals per camp, never a student', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, room);
		const res = await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res.support.a).toEqual({ mean: 1, n: 1, m: 2 });
		expect(res.support.b).toEqual({ mean: -1, n: 1, m: 1 });
		expect(res.support.center).toEqual({ mean: 0.5, n: 1, m: 1 });
		expect(JSON.stringify(res)).not.toMatch(/a1|a2|b1|c1|side/);
	});

	it('refuses a student until support by side is shown to everyone, then answers', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, room);
		await expectCode(
			lessonSupportBySide(fake.asFirestore(), 'a1', { mainId: MAIN }),
			'permission-denied',
		);
		seedLesson(fake, room, SUMMARY, { liveResults: true, supportShown: true });
		await expect(
			lessonSupportBySide(fake.asFirestore(), 'a1', { mainId: MAIN }),
		).resolves.toHaveProperty('support');
	});

	it('refuses someone who never joined', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, room, SUMMARY, { liveResults: true, supportShown: true });
		await expectCode(
			lessonSupportBySide(fake.asFirestore(), 'stranger', { mainId: MAIN }),
			'permission-denied',
		);
	});

	it('refuses even the teacher while the class is picking sides', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, room, SIDE_STEP);
		await expectCode(
			lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
		);
	});
});

describe('supportStepOpen', () => {
	it('is open at Vote and Summary, and in a lesson without a plan', () => {
		const at = (stepIndex: number): boolean =>
			supportStepOpen({
				statementSettings: { lessonPlan: { steps: STEPS, stepIndex } },
			} as unknown as Statement);
		expect(at(STEPS.indexOf('vote'))).toBe(true);
		expect(at(SUMMARY)).toBe(true);
		expect(at(SIDE_STEP)).toBe(false);
		expect(at(STEPS.indexOf('tables'))).toBe(false);
		expect(supportStepOpen({} as Statement)).toBe(true);
	});
});

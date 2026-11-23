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
		// Every camp here was rated by fewer than 3: no mean leaves the server.
		expect(res.support.a).toEqual({ hidden: true });
		expect(res.support.b).toEqual({ hidden: true });
		expect(res.support.center).toEqual({ hidden: true });
		expect(res.support.verdict).toBe('insufficient');
		expect(JSON.stringify(res)).not.toMatch(/a1|a2|b1|c1|side|mean/);
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
	it('is open at Vote and Summary only, never in a lesson without a plan', () => {
		const at = (stepIndex: number): boolean =>
			supportStepOpen({
				statementSettings: { lessonPlan: { steps: STEPS, stepIndex } },
			} as unknown as Statement);
		expect(at(STEPS.indexOf('vote'))).toBe(true);
		expect(at(SUMMARY)).toBe(true);
		expect(at(SIDE_STEP)).toBe(false);
		expect(at(STEPS.indexOf('tables'))).toBe(false);
		expect(supportStepOpen({} as Statement)).toBe(false);
	});
});

describe('classSupportBySide hides small camps (decision B)', () => {
	function campOf(
		tag: string,
		size: number,
		camp: 'a' | 'center' | 'b',
		support: number,
	): Student[] {
		return Array.from({ length: size }, (_, i) => ({
			uid: `${tag}${i}`,
			side: camp === 'a' ? 10 : camp === 'b' ? 90 : 50,
			camp,
			support,
		}));
	}

	it.each([0, 1, 2, 3])('a camp of %i student(s), all rating', async (size) => {
		const fake = new FakeFirestore();
		seedLesson(fake, [
			...campOf('a', size, 'a', 1),
			...campOf('c', 3, 'center', 0),
			...campOf('b', 4, 'b', 0.8),
		]);
		const res = await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		if (size < 3) {
			// No mean and no size for a; and no count anywhere, so a's size cannot be derived.
			expect(res.support.a).toEqual({ hidden: true });
			expect(res.support.verdict).toBe('insufficient');
			expect(res.support.b).toEqual({ hidden: false, mean: 0.8, counts: null });
		} else {
			expect(res.support.a).toEqual({ hidden: false, mean: 1, counts: { n: 3, m: 3 } });
			expect(res.support.b).toEqual({ hidden: false, mean: 0.8, counts: { n: 4, m: 4 } });
		}
	});

	it('a camp of 5 that only 2 rated: no mean; the others keep their counts', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [
			...campOf('a', 2, 'a', 1),
			...campOf('x', 3, 'a', 1).map((s) => ({ ...s, support: undefined })),
			...campOf('c', 3, 'center', 0),
			...campOf('b', 4, 'b', 0.8),
		]);
		const res = await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res.support.a).toEqual({ hidden: true });
		expect(res.support.center).toEqual({ hidden: false, mean: 0, counts: { n: 3, m: 3 } });
	});

	it('the hidden mean cannot be recovered by subtraction: no overall total is sent', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [
			...campOf('a', 4, 'a', 1),
			...campOf('c', 1, 'center', -1),
			...campOf('b', 4, 'b', 1),
		]);
		const res = await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res.support.center).toEqual({ hidden: true });
		expect(Object.keys(res.support).sort()).toEqual(['a', 'b', 'center', 'verdict']);
		expect(Object.keys(res)).toEqual(['support']);
		expect(Object.keys(res.support.a).sort()).toEqual(['counts', 'hidden', 'mean']);
		// a camp of one: the 4 + 4 + 1 that chose must not be recoverable, so no count is sent
		expect(res.support.a).toEqual({ hidden: false, mean: 1, counts: null });
		expect(JSON.stringify(res)).not.toMatch(/"n"|"m"|-1/);
	});
});

describe('classSupportBySide locks the sides for good (decision C)', () => {
	it('writes classSideLocks/{mainId} before answering, and keeps the first time', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [{ uid: 'a1', side: 10, camp: 'a' }]);
		expect(fake.read(`classSideLocks/${MAIN}`)).toBeUndefined();
		await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		const first = fake.read(`classSideLocks/${MAIN}`);
		expect(first).toMatchObject({ mainId: MAIN, lockedAt: expect.any(Number) });
		await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(fake.read(`classSideLocks/${MAIN}`)).toEqual(first);
	});

	it('does not lock when it refuses (the Side step)', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [{ uid: 'a1', side: 10, camp: 'a' }], SIDE_STEP);
		await expectCode(
			lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN }),
			'failed-precondition',
		);
		expect(fake.read(`classSideLocks/${MAIN}`)).toBeUndefined();
	});
});

describe('a support without a side (decision support saved, no camp)', () => {
	it('is counted in no camp and does not break the totals', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, [
			{ uid: 'a1', side: 10, camp: 'a', support: 1 },
			{ uid: 'a2', side: 10, camp: 'a', support: 1 },
			{ uid: 'a3', side: 10, camp: 'a', support: 1 },
			{ uid: 'lone', support: -1 },
		]);
		expect(fake.read(`classSides/lone--${MAIN}`)).not.toHaveProperty('camp');
		const res = await lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
		// a is the only camp that passes, so every camp is hidden (and the lone rating counts nowhere)
		expect(res.support).toEqual({
			a: { hidden: true },
			center: { hidden: true },
			b: { hidden: true },
			verdict: 'insufficient',
		});
	});
});

describe('classSupportBySide needs two shown camps (one shown camp would place the choosers)', () => {
	function campOf(tag: string, size: number, camp: 'a' | 'center' | 'b', support = 1): Student[] {
		return Array.from({ length: size }, (_, i) => ({
			uid: `${tag}${i}`,
			side: camp === 'a' ? 10 : camp === 'b' ? 90 : 50,
			camp,
			support,
		}));
	}
	const ALL_HIDDEN = {
		support: {
			a: { hidden: true },
			center: { hidden: true },
			b: { hidden: true },
			verdict: 'insufficient',
		},
	};
	const answer = async (students: Student[]) => {
		const fake = new FakeFirestore();
		seedLesson(fake, students);

		return lessonSupportBySide(fake.asFirestore(), TEACHER, { mainId: MAIN });
	};

	it('3 students, all in b: the body is all hidden', async () => {
		expect(await answer(campOf('b', 3, 'b'))).toEqual(ALL_HIDDEN);
	});

	it('5 in b and 1 in a: the body is all hidden', async () => {
		expect(await answer([...campOf('b', 5, 'b'), ...campOf('a', 1, 'a')])).toEqual(ALL_HIDDEN);
	});

	it('3 in a and 3 in b, nobody in the middle: a and b without counts', async () => {
		expect(await answer([...campOf('a', 3, 'a', 1), ...campOf('b', 3, 'b', 0.5)])).toEqual({
			support: {
				a: { hidden: false, mean: 1, counts: null },
				center: { hidden: true },
				b: { hidden: false, mean: 0.5, counts: null },
				verdict: 'apart',
			},
		});
	});

	it('3 / 3 / 3: all shown with counts', async () => {
		const res = await answer([
			...campOf('a', 3, 'a'),
			...campOf('c', 3, 'center'),
			...campOf('b', 3, 'b'),
		]);
		for (const camp of [res.support.a, res.support.center, res.support.b]) {
			expect(camp).toEqual({ hidden: false, mean: 1, counts: { n: 3, m: 3 } });
		}
	});

	it('two eligible camps, one rated by only 2: the body is all hidden', async () => {
		const res = await answer([
			...campOf('a', 3, 'a'),
			...campOf('x', 2, 'b'),
			...campOf('y', 3, 'b').map((st) => ({ ...st, support: undefined })),
		]);
		expect(res).toEqual(ALL_HIDDEN);
	});
});

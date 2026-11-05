import type { ClassTable, LessonStepKey } from '@freedi/shared-types';
import { assignTables } from '../fn_classAssignTables';
import { moveStudent } from '../fn_classMoveStudent';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

/**
 * Trello 3sq65nGv: the teacher moves students at ANY point of a running lesson,
 * and what a student wrote or voted stays theirs.
 */

const MAIN = 'main1';
const TEACHER = 'teacher';
const STEPS: LessonStepKey[] = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'vote',
	'summary',
];
const STUDENT_COUNT = 6;
const HOUR_MS = 3_600_000;

function fixedRng(): () => number {
	let i = 0;

	return () => ((i++ * 7) % 10) / 10;
}

function seed(fake: FakeFirestore, stepIndex: number): string[] {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: { tableSize: 3, lessonPlan: { steps: STEPS, stepIndex } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	const uids: string[] = [];
	for (let i = 0; i < STUDENT_COUNT; i++) {
		const uid = `s${i}`;
		uids.push(uid);
		fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
			userId: uid,
			statementId: MAIN,
			role: 'member',
			side: 10,
			camp: 'a',
			createdAt: 1000 + i,
		});
	}
	fake.seed('statements/ch', {
		statementId: 'ch',
		parentId: MAIN,
		statementType: 'question',
		createdAt: 5,
		statementSettings: { classRole: 'challenge' },
	});

	return uids;
}

/** Flip the seated lesson to paused or ended (the tables are assigned while it still runs). */
function holdLesson(fake: FakeFirestore, status: 'paused' | 'ended', extra: object): void {
	fake.seed(`statements/${MAIN}`, {
		...(fake.read(`statements/${MAIN}`) as Record<string, unknown>),
		statementSettings: {
			tableSize: 3,
			lessonPlan: { steps: STEPS, stepIndex: 4, status, ...extra },
		},
	});
}

describe('classMoveStudent works at every running step', () => {
	it.each(STEPS.map((step, index) => [step, index] as const))(
		'moves a student at %s and leaves their proposal, vote and side alone',
		async (_step, index) => {
			const fake = new FakeFirestore();
			const uids = seed(fake, index);
			const db = fake.asFirestore();
			await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
			const tables = fake.list('classTables') as unknown as ClassTable[];
			const from = tables.find((tb) => tb.memberUids.length > 0) as ClassTable;
			const mover = from.memberUids[0];
			const toN = tables.find((tb) => tb.n !== from.n)?.n as number;
			const proposal = {
				statementId: 'p1',
				parentId: 'ch',
				statement: 'An idea',
				creatorId: mover,
				classTable: { tableId: from.tableId, shared: false, coAuthors: [] },
			};
			const vote = { voteId: `${mover}--ch`, statementId: 'p1', parentId: 'ch', userId: mover };
			fake.seed('statements/p1', proposal);
			fake.seed(`votes/${mover}--ch`, vote);

			await moveStudent(db, TEACHER, { mainId: MAIN, uid: mover, toTable: toN });

			const sub = fake.read(`statementsSubscribe/${mover}--${MAIN}`);
			expect(sub?.tableId).toBe(`${MAIN}--${toN}`);
			expect(sub?.side).toBe(10);
			expect(sub?.camp).toBe('a');
			expect(fake.read('statements/p1')).toEqual(proposal);
			expect(fake.read(`votes/${mover}--ch`)).toEqual(vote);
			const after = fake.list('classTables') as unknown as ClassTable[];
			expect(after.find((tb) => tb.n === toN)?.memberUids).toContain(mover);
			expect(after.find((tb) => tb.n === from.n)?.memberUids).not.toContain(mover);
			expect(uids).toContain(mover);
		},
	);

	it('moves a student while the lesson is paused, and does not move the old table on by itself', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		const tables = fake.list('classTables') as unknown as ClassTable[];
		const from = tables.find((tb) => tb.memberUids.length > 1) as ClassTable;
		const [mover, stays, third] = from.memberUids;
		const toN = tables.find((tb) => tb.n !== from.n)?.n as number;
		const endsAt = Date.now() + HOUR_MS;
		fake.seed(`classTables/${from.tableId}`, {
			...from,
			step: 'talk',
			questionId: 'q1',
			askerUid: mover,
			moveOnUids: [stays, third],
			speakerUid: stays,
			speakerEndsAt: endsAt,
		});
		holdLesson(fake, 'paused', { pausedAt: 1 });

		await moveStudent(db, TEACHER, { mainId: MAIN, uid: mover, toTable: toN });

		expect(fake.read(`statementsSubscribe/${mover}--${MAIN}`)?.tableId).toBe(`${MAIN}--${toN}`);
		const left = fake.read(`classTables/${from.tableId}`) as unknown as ClassTable;
		expect(left.memberUids).not.toContain(mover);
		// Paused: the press count is met by the smaller table, yet nothing advanced and no timer was cut.
		expect(left.step).toBe('talk');
		expect(left.speakerUid).toBe(stays);
		expect(left.speakerEndsAt).toBe(endsAt);
	});

	it('refuses to move a student once the lesson has ended', async () => {
		const fake = new FakeFirestore();
		const uids = seed(fake, 4);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		holdLesson(fake, 'ended', { endedAt: 1 });
		const attempt = moveStudent(db, TEACHER, { mainId: MAIN, uid: uids[0], toTable: 1 });
		await expect(attempt).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('refuses a student who tries to move a classmate, at any step', async () => {
		const fake = new FakeFirestore();
		const uids = seed(fake, 4);
		const db = fake.asFirestore();
		await assignTables(db, TEACHER, { mainId: MAIN }, fixedRng());
		holdLesson(fake, 'ended', { endedAt: 1 });
		const attempt = moveStudent(db, uids[1], { mainId: MAIN, uid: uids[0], toTable: 1 });
		await expect(attempt).rejects.toBeInstanceOf(ClassroomError);
		await expect(attempt).rejects.toMatchObject({ code: 'permission-denied' });
	});
});

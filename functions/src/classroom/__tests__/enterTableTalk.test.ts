import { enterTableTalk } from '../fn_classEnterTableTalk';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';
import type { ClassTable } from '@freedi/shared-types';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
const OLD_UPDATED_AT = 1;

function seed(fake: FakeFirestore, stepIndex: number, status?: string): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		statementType: 'question',
		creatorId: TEACHER,
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex, ...(status ? { status } : {}) } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed(`statementsSubscribe/s1--${MAIN}`, { userId: 's1', statementId: MAIN, role: 'member' });
}

function seedStaleTable(fake: FakeFirestore, n: number): void {
	fake.seed(`classTables/${MAIN}--${n}`, {
		tableId: `${MAIN}--${n}`,
		mainId: MAIN,
		n,
		memberUids: ['s1', 's2'],
		step: 'rate',
		turn: 3,
		questionId: 'q1',
		writerUid: 's1',
		writtenUids: ['s1'],
		speakerUid: 's2',
		speakerEndsAt: 123,
		speakerMs: 60000,
		proposalsTurn: 2,
		spokenUids: ['s1'],
		updatedAt: OLD_UPDATED_AT,
	});
}

describe('classEnterTableTalk', () => {
	it('puts every table on talk with no pen and no speaker, and stamps updatedAt', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedStaleTable(fake, 1);
		seedStaleTable(fake, 2);
		const before = Date.now();
		const res = await enterTableTalk(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(res).toEqual({ reset: 2 });
		for (const n of [1, 2]) {
			const table = fake.read(`classTables/${MAIN}--${n}`) as unknown as ClassTable;
			expect(table.step).toBe('talk');
			expect(table.updatedAt).toBeGreaterThanOrEqual(before);
			for (const gone of ['writerUid', 'writtenUids', 'speakerUid', 'speakerEndsAt', 'speakerMs']) {
				expect(table).not.toHaveProperty(gone);
			}
		}
	});

	it('keeps what Table talk shares with Proposals, and the members', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedStaleTable(fake, 1);
		await enterTableTalk(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(fake.read(`classTables/${MAIN}--1`)).toMatchObject({
			proposalsTurn: 2,
			spokenUids: ['s1'],
			memberUids: ['s1', 's2'],
			turn: 3,
			questionId: 'q1',
		});
	});

	it('is a no-op for a lesson with no tables', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		await expect(enterTableTalk(fake.asFirestore(), TEACHER, { mainId: MAIN })).resolves.toEqual({
			reset: 0,
		});
	});

	it('refuses a non-admin, another step and an ended lesson, and leaves the tables alone', async () => {
		const fake = new FakeFirestore();
		seed(fake, 4);
		seedStaleTable(fake, 1);
		const db = fake.asFirestore();
		await expect(enterTableTalk(db, 's1', { mainId: MAIN })).rejects.toMatchObject({
			code: 'permission-denied',
		});
		seed(fake, 5);
		await expect(enterTableTalk(db, TEACHER, { mainId: MAIN })).rejects.toMatchObject({
			reason: 'not-table-talk',
		});
		seed(fake, 4, 'ended');
		const ended = enterTableTalk(db, TEACHER, { mainId: MAIN });
		await expect(ended).rejects.toBeInstanceOf(ClassroomError);
		await expect(ended).rejects.toMatchObject({ reason: 'lesson-ended' });
		expect(fake.read(`classTables/${MAIN}--1`)).toMatchObject({
			step: 'rate',
			updatedAt: OLD_UPDATED_AT,
		});
	});
});

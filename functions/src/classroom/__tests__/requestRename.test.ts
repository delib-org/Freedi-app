import { requestRename } from '../fn_classRequestRename';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

/** Trello 0afoikKD: only the lesson's teacher can ask a student for a new name. */

const MAIN = 'main1';
const TEACHER = 'teacher';
const STUDENT = 's0';
const OTHER = 's1';
const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
const NOW = 1_800_000_000_000;

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

function seed(stepIndex = 3, plan: Record<string, unknown> = {}): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex, ...plan } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	for (const uid of [STUDENT, OTHER]) {
		fake.seed(`statementsSubscribe/${uid}--${MAIN}`, {
			userId: uid,
			statementId: MAIN,
			role: 'member',
			user: { uid, displayName: 'Dana' },
			side: 20,
			camp: 'a',
		});
	}

	return fake;
}

describe('classRequestRename', () => {
	it.each(STEPS.map((step, index) => [step, index] as const))(
		'the teacher can ask at %s; the name and side stay, the flag is set',
		async (_step, index) => {
			const fake = seed(index);
			const result = await requestRename(fake.asFirestore(), TEACHER, {
				mainId: MAIN,
				uid: STUDENT,
			});
			expect(result).toEqual({ ok: true });
			const sub = fake.read(`statementsSubscribe/${STUDENT}--${MAIN}`);
			expect(sub?.renameRequested).toBe(true);
			expect(sub?.user).toEqual({ uid: STUDENT, displayName: 'Dana' });
			expect(sub?.side).toBe(20);
			expect(fake.read(`statementsSubscribe/${OTHER}--${MAIN}`)?.renameRequested).toBeUndefined();
		},
	);

	it('works while the lesson is paused', async () => {
		const fake = seed(3, { status: 'paused', pausedAt: NOW });
		await requestRename(fake.asFirestore(), TEACHER, { mainId: MAIN, uid: STUDENT });
		expect(fake.read(`statementsSubscribe/${STUDENT}--${MAIN}`)?.renameRequested).toBe(true);
	});

	it('refuses once the lesson has ended', async () => {
		const fake = seed(3, { status: 'ended', endedAt: NOW });
		await expectCode(
			requestRename(fake.asFirestore(), TEACHER, { mainId: MAIN, uid: STUDENT }),
			'failed-precondition',
		);
	});

	it('refuses a student asking for a classmate (not the lesson teacher)', async () => {
		const fake = seed();
		await expectCode(
			requestRename(fake.asFirestore(), OTHER, { mainId: MAIN, uid: STUDENT }),
			'permission-denied',
		);
		await expectCode(
			requestRename(fake.asFirestore(), STUDENT, { mainId: MAIN, uid: STUDENT }),
			'permission-denied',
		);
		expect(fake.read(`statementsSubscribe/${STUDENT}--${MAIN}`)?.renameRequested).toBeUndefined();
	});

	it('refuses a stranger who is signed in but has no part in the lesson', async () => {
		const fake = seed();
		await expectCode(
			requestRename(fake.asFirestore(), 'stranger', { mainId: MAIN, uid: STUDENT }),
			'permission-denied',
		);
	});

	it('refuses a student who has not joined, a teacher as target and bad ids', async () => {
		const fake = seed();
		const db = fake.asFirestore();
		await expectCode(requestRename(db, TEACHER, { mainId: MAIN, uid: 'nobody' }), 'not-found');
		await expectCode(
			requestRename(db, TEACHER, { mainId: MAIN, uid: TEACHER }),
			'failed-precondition',
		);
		await expectCode(requestRename(db, TEACHER, { mainId: MAIN, uid: '' }), 'invalid-argument');
	});
});

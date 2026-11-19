import { setLessonRemoved } from '../fn_classSetLessonRemoved';
import { setLessonStatus } from '../fn_classSetLessonStatus';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

const MAIN = 'main1';
const TEACHER = 'teacher';
const STUDENT = 's00';
const T0 = 1_800_000_000_000;

async function expectCode(promise: Promise<unknown>, code: string, reason?: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject(reason ? { code, reason } : { code });
}

function seed(
	plan: Record<string, unknown> | null,
	extra: Record<string, unknown> = {},
): FakeFirestore {
	const fake = new FakeFirestore();
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		statementSettings: plan ? { lessonPlan: plan, ...extra } : {},
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	fake.seed(`statementsSubscribe/${STUDENT}--${MAIN}`, {
		userId: STUDENT,
		statementId: MAIN,
		role: 'member',
	});

	return fake;
}

const plan = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	steps: ['waiting', 'opening', 'side'],
	stepIndex: 0,
	...extra,
});

const removedAtOf = (fake: FakeFirestore): unknown =>
	(fake.read(`statements/${MAIN}`)?.statementSettings as { lessonRemovedAt?: number })
		.lessonRemovedAt;

describe('classSetLessonRemoved', () => {
	it('refuses a student, an unknown lesson, a non-lesson and a bad flag', async () => {
		const fake = seed(plan());
		await expectCode(
			setLessonRemoved(fake.asFirestore(), STUDENT, { mainId: MAIN, removed: true }),
			'permission-denied',
		);
		await expectCode(
			setLessonRemoved(fake.asFirestore(), TEACHER, { mainId: 'nope', removed: true }),
			'not-found',
		);
		await expectCode(
			setLessonRemoved(seed(null).asFirestore(), TEACHER, { mainId: MAIN, removed: true }),
			'failed-precondition',
		);
		await expectCode(
			setLessonRemoved(fake.asFirestore(), TEACHER, {
				mainId: MAIN,
				removed: 'yes' as unknown as boolean,
			}),
			'invalid-argument',
		);
		expect(removedAtOf(fake)).toBeUndefined();
	});

	it('refuses a lesson that is running, paused or open', async () => {
		for (const running of [
			plan({ stepIndex: 3 }),
			plan({ status: 'live', stepIndex: 2 }),
			plan({ status: 'paused', stepIndex: 0 }),
			plan({ status: 'open', stepIndex: 0 }),
		]) {
			const fake = seed(running);
			await expectCode(
				setLessonRemoved(fake.asFirestore(), TEACHER, { mainId: MAIN, removed: true }),
				'failed-precondition',
				'lesson-running',
			);
			expect(removedAtOf(fake)).toBeUndefined();
		}
	});

	it('removes a lesson that has not started and one that ended, stamping ms', async () => {
		for (const ok of [plan(), plan({ status: 'ended', stepIndex: 5 })]) {
			const fake = seed(ok);
			const res = await setLessonRemoved(
				fake.asFirestore(),
				TEACHER,
				{ mainId: MAIN, removed: true },
				() => T0,
			);
			expect(res).toEqual({ removed: true, removedAt: T0 });
			expect(removedAtOf(fake)).toBe(T0);
		}
	});

	it('is a no-op on a repeat and restores by deleting the flag', async () => {
		const fake = seed(plan({ status: 'ended' }));
		const db = fake.asFirestore();
		await setLessonRemoved(db, TEACHER, { mainId: MAIN, removed: true }, () => T0);
		const again = await setLessonRemoved(
			db,
			TEACHER,
			{ mainId: MAIN, removed: true },
			() => T0 + 5,
		);
		expect(again).toEqual({ removed: true, removedAt: T0 });
		expect(removedAtOf(fake)).toBe(T0);
		expect(await setLessonRemoved(db, TEACHER, { mainId: MAIN, removed: false })).toEqual({
			removed: false,
		});
		expect(removedAtOf(fake)).toBeUndefined();
		expect(await setLessonRemoved(db, TEACHER, { mainId: MAIN, removed: false })).toEqual({
			removed: false,
		});
	});

	it('reopening a removed ended lesson clears the flag', async () => {
		const fake = seed(plan({ status: 'ended', stepIndex: 4 }), { lessonRemovedAt: T0 });
		await setLessonStatus(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, action: 'reopen' },
			() => T0 + 1,
		);
		expect(removedAtOf(fake)).toBeUndefined();
	});

	it('keeps the flag when another status move happens', async () => {
		const fake = seed(plan({ status: 'live', stepIndex: 0 }), { lessonRemovedAt: T0 });
		await setLessonStatus(
			fake.asFirestore(),
			TEACHER,
			{ mainId: MAIN, action: 'end' },
			() => T0 + 1,
		);
		expect(removedAtOf(fake)).toBe(T0);
	});
});

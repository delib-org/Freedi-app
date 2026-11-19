import { assertWorkspaceAdminTogether } from '../classroomAccess';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';

/**
 * Trello w13dMDZf: the lesson and the caller's role are read together. The
 * refusals and their order are the ones `assertWorkspaceAdmin` always gave.
 */

const MAIN = 'main1';
const TEACHER = 'teacher';

function seedLesson(fake: FakeFirestore, extra: Record<string, unknown> = {}): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'T' },
		...extra,
	});
}

async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;

		return undefined;
	} catch (error) {
		return error instanceof ClassroomError ? error.code : 'other';
	}
}

describe('assertWorkspaceAdminTogether', () => {
	it('lets the creator in without a subscription', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		const main = await assertWorkspaceAdminTogether(fake.asFirestore(), MAIN, TEACHER);
		expect(main.statementId).toBe(MAIN);
	});

	it('lets a co-admin in through the subscription', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		fake.seed(`statementsSubscribe/other--${MAIN}`, {
			userId: 'other',
			statementId: MAIN,
			role: 'admin',
		});
		await expect(
			assertWorkspaceAdminTogether(fake.asFirestore(), MAIN, 'other'),
		).resolves.toBeDefined();
	});

	it('refuses a student', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		fake.seed(`statementsSubscribe/s1--${MAIN}`, {
			userId: 's1',
			statementId: MAIN,
			role: 'member',
		});
		expect(await reasonOf(assertWorkspaceAdminTogether(fake.asFirestore(), MAIN, 's1'))).toBe(
			'permission-denied',
		);
	});

	it('refuses a stranger with no subscription at all', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake);
		expect(await reasonOf(assertWorkspaceAdminTogether(fake.asFirestore(), MAIN, 'nobody'))).toBe(
			'permission-denied',
		);
	});

	it('says "lesson not found" before anything about the role', async () => {
		const fake = new FakeFirestore();
		expect(await reasonOf(assertWorkspaceAdminTogether(fake.asFirestore(), MAIN, 'nobody'))).toBe(
			'not-found',
		);
	});
});

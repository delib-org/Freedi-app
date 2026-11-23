import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { createFakeDb } from '../../progress/__tests__/fakeDb';
import type { FakeDb } from '../../progress/__tests__/fakeDb';
import {
	changesStudentCount,
	classStudentCountPatch,
	countClassStudents,
	updateClassStudentCount,
} from '../classStudentCount';

/**
 * statementSettings.studentCount (Trello sN881XCU): the server counts a
 * lesson's students because a phone may read only its own table's
 * subscriptions. Always a from-scratch recount.
 */

type Data = Record<string, unknown>;

const LESSON = 'lesson-1';
const lessonDoc = (settings: Data = {}): Data => ({
	statementId: LESSON,
	statementType: StatementType.question,
	statementSettings: { lessonPlan: { steps: ['side', 'vote'], stepIndex: 0 }, ...settings },
	lastUpdate: 1,
});

let fake: FakeDb = createFakeDb();
const db = (): Firestore => fake.db as unknown as Firestore;
const lesson = (): Data | undefined => fake.read(Collections.statements, LESSON);

function seedSubs(subs: Array<{ userId: string; role?: string; statementId?: string }>): void {
	for (const { userId, role, statementId = LESSON } of subs) {
		fake.seed(Collections.statementsSubscribe, `${userId}--${statementId}`, {
			userId,
			statementId,
			...(role === undefined ? {} : { role }),
		});
	}
}

beforeEach(() => {
	fake = createFakeDb();
});

describe('countClassStudents', () => {
	it('counts everyone who is not a teacher, banned included', async () => {
		seedSubs([
			{ userId: 't', role: Role.admin },
			{ userId: 'c', role: Role.creator },
			{ userId: 'legacy', role: 'creator' },
			{ userId: 'a', role: Role.member },
			{ userId: 'b', role: Role.member },
			{ userId: 'x', role: Role.banned },
			{ userId: 'other', role: Role.member, statementId: 'elsewhere' },
		]);

		await expect(countClassStudents(db(), LESSON)).resolves.toBe(3);
	});
});

describe('classStudentCountPatch', () => {
	it('returns the count when it moved and nothing when it is right', async () => {
		seedSubs([
			{ userId: 'a', role: Role.member },
			{ userId: 'b', role: Role.member },
		]);

		await expect(
			classStudentCountPatch(db(), LESSON, lessonDoc() as unknown as Statement),
		).resolves.toEqual({ 'statementSettings.studentCount': 2 });
		await expect(
			classStudentCountPatch(db(), LESSON, lessonDoc({ studentCount: 2 }) as unknown as Statement),
		).resolves.toEqual({});
	});

	it('runs no query for a statement that is not a lesson', async () => {
		seedSubs([{ userId: 'a', role: Role.member }]);
		for (const statement of [
			undefined,
			{ statementId: LESSON, statementSettings: {} },
			{ statementId: LESSON, statementSettings: { classHome: { kind: 'class' }, lessonPlan: {} } },
		]) {
			await expect(
				classStudentCountPatch(db(), LESSON, statement as unknown as Statement | undefined),
			).resolves.toEqual({});
		}
	});
});

describe('updateClassStudentCount', () => {
	it('stores the count on the lesson, keeping its other settings', async () => {
		fake.seed(Collections.statements, LESSON, lessonDoc());
		seedSubs([
			{ userId: 't', role: Role.admin },
			{ userId: 'a', role: Role.member },
			{ userId: 'b', role: Role.member },
		]);

		await expect(updateClassStudentCount(db(), LESSON)).resolves.toBe(2);
		expect(lesson()).toMatchObject({
			statementSettings: { studentCount: 2, lessonPlan: { stepIndex: 0 } },
		});
		expect(lesson()?.lastUpdate).toBeGreaterThan(1);
	});

	it('writes nothing when the stored count is already right', async () => {
		fake.seed(Collections.statements, LESSON, lessonDoc({ studentCount: 1 }));
		seedSubs([{ userId: 'a', role: Role.member }]);

		await expect(updateClassStudentCount(db(), LESSON)).resolves.toBe(1);
		expect(lesson()?.lastUpdate).toBe(1);
	});

	it('stores zero when the last student leaves', async () => {
		fake.seed(Collections.statements, LESSON, lessonDoc({ studentCount: 1 }));
		seedSubs([{ userId: 't', role: Role.admin }]);

		await expect(updateClassStudentCount(db(), LESSON)).resolves.toBe(0);
		expect(lesson()).toMatchObject({ statementSettings: { studentCount: 0 } });
	});

	it('leaves a missing statement, a class home and a non-lesson alone', async () => {
		seedSubs([{ userId: 'a', role: Role.member }]);
		await expect(updateClassStudentCount(db(), LESSON)).resolves.toBeNull();

		for (const statement of [
			{ statementId: LESSON, statementSettings: { classHome: { kind: 'class' }, lessonPlan: {} } },
			{ statementId: LESSON, statementSettings: {} },
		]) {
			fake.seed(Collections.statements, LESSON, statement);
			await expect(updateClassStudentCount(db(), LESSON)).resolves.toBeNull();
			expect(lesson()).toEqual(statement);
		}
	});
});

describe('changesStudentCount', () => {
	it('a role change across the teacher line recounts; other changes do not', () => {
		const at = (role: string): Data => ({ statement: lessonDoc(), role });
		expect(changesStudentCount(at(Role.member), at(Role.admin))).toBe(true);
		expect(changesStudentCount(at(Role.admin), at(Role.member))).toBe(true);
		expect(changesStudentCount(at(Role.member), at(Role.banned))).toBe(false);
		expect(changesStudentCount(at(Role.admin), at(Role.creator))).toBe(false);
		expect(changesStudentCount({ role: Role.member }, { role: Role.admin })).toBe(false);
	});
});

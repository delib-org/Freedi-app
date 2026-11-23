import { describe, it, expect } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role } from '@freedi/shared-types';
import {
	changesStudentCount,
	isClassLessonSubscription,
	updateClassStudentCount,
} from '../classStudentCount';

/**
 * statementSettings.studentCount (Trello sN881XCU): the server counts a
 * lesson's students because a phone may read only its own table's
 * subscriptions. A small in-memory Firestore: one statement, the
 * subscriptions, and a transaction that applies its updates at the end.
 */

type Data = Record<string, unknown>;
interface Filter {
	field: string;
	op: '==' | 'not-in';
	value: unknown;
}

const LESSON = 'lesson-1';
const lessonDoc = (settings: Data = {}): Data => ({
	statementId: LESSON,
	statementSettings: { lessonPlan: { steps: ['side', 'vote'], stepIndex: 0 }, ...settings },
});

function fakeDb(statement: Data | undefined, subscriptions: Data[]) {
	const state = { statement, updates: [] as Data[], transactions: 0 };
	const matches = (sub: Data, filters: Filter[]): boolean =>
		filters.every((f) =>
			f.op === '=='
				? sub[f.field] === f.value
				: sub[f.field] !== undefined && !(f.value as unknown[]).includes(sub[f.field]),
		);
	const query = (filters: Filter[]) => ({
		where: (field: string, op: Filter['op'], value: unknown) =>
			query([...filters, { field, op, value }]),
		count: () => ({
			kind: 'count' as const,
			count: () => subscriptions.filter((s) => matches(s, filters)).length,
		}),
	});
	const lessonRef = { kind: 'doc' as const };
	const db = {
		collection: (name: string) =>
			name === Collections.statements ? { doc: () => lessonRef } : query([]),
		runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
			state.transactions += 1;
			const pending: Data[] = [];
			const tx = {
				get: async (target: { kind: 'doc' } | { kind: 'count'; count: () => number }) =>
					target.kind === 'doc'
						? { exists: state.statement !== undefined, data: () => state.statement }
						: { data: () => ({ count: target.count() }) },
				update: (_ref: unknown, data: Data) => pending.push(data),
			};
			const result = await fn(tx);
			state.updates.push(...pending);

			return result;
		},
	};

	return { db: db as unknown as Firestore, state };
}

const sub = (userId: string, role: string): Data => ({ statementId: LESSON, userId, role });

describe('updateClassStudentCount', () => {
	it('counts every subscription that is not a teacher, and stores it', async () => {
		const { db, state } = fakeDb(lessonDoc(), [
			sub('t', Role.admin),
			sub('c', Role.creator),
			sub('legacy', 'creator'),
			sub('a', Role.member),
			sub('b', Role.member),
			sub('x', Role.banned),
			{ ...sub('other', Role.member), statementId: 'elsewhere' },
		]);

		await expect(updateClassStudentCount(db, LESSON)).resolves.toBe(3);
		expect(state.updates).toHaveLength(1);
		expect(state.updates[0]['statementSettings.studentCount']).toBe(3);
		expect(typeof state.updates[0].lastUpdate).toBe('number');
	});

	it('writes nothing when the stored count is already right', async () => {
		const { db, state } = fakeDb(lessonDoc({ studentCount: 1 }), [sub('a', Role.member)]);

		await expect(updateClassStudentCount(db, LESSON)).resolves.toBe(1);
		expect(state.updates).toHaveLength(0);
	});

	it('stores zero when the last student leaves', async () => {
		const { db, state } = fakeDb(lessonDoc({ studentCount: 1 }), [sub('t', Role.admin)]);

		await expect(updateClassStudentCount(db, LESSON)).resolves.toBe(0);
		expect(state.updates[0]['statementSettings.studentCount']).toBe(0);
	});

	it('leaves a missing statement, a class home and a non-lesson alone', async () => {
		for (const statement of [
			undefined,
			{ statementId: LESSON, statementSettings: { classHome: { kind: 'class' }, lessonPlan: {} } },
			{ statementId: LESSON, statementSettings: {} },
		]) {
			const { db, state } = fakeDb(statement, [sub('a', Role.member)]);
			await expect(updateClassStudentCount(db, LESSON)).resolves.toBeNull();
			expect(state.updates).toHaveLength(0);
		}
	});
});

describe('which subscription changes recount', () => {
	const classCopy = { statement: lessonDoc() } as Data;

	it('a subscription carrying a lesson copy is a Class one; others are not', () => {
		expect(isClassLessonSubscription(classCopy)).toBe(true);
		expect(isClassLessonSubscription({ statement: { statementId: 'q' } } as Data)).toBe(false);
		expect(isClassLessonSubscription({})).toBe(false);
		expect(isClassLessonSubscription(undefined)).toBe(false);
	});

	it('a role change across the teacher line recounts; other changes do not', () => {
		const at = (role: string): Data => ({ ...classCopy, role });
		expect(changesStudentCount(at(Role.member), at(Role.admin))).toBe(true);
		expect(changesStudentCount(at(Role.admin), at(Role.member))).toBe(true);
		expect(changesStudentCount(at(Role.member), at(Role.banned))).toBe(false);
		expect(changesStudentCount(at(Role.admin), at(Role.creator))).toBe(false);
		expect(changesStudentCount({ role: Role.member }, { role: Role.admin })).toBe(false);
	});
});

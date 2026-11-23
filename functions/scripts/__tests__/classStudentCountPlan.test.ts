import { describe, it, expect } from '@jest/globals';
import { needsStudentCount, planStudentCount } from '../classStudentCountPlan';
import type { LessonLike } from '../classStudentCountPlan';

const lessonPlan = { steps: ['waiting', 'side'], stepIndex: 1 };
const lesson = (studentCount?: number): LessonLike => ({
	statementSettings: studentCount === undefined ? { lessonPlan } : { lessonPlan, studentCount },
});

describe('needsStudentCount', () => {
	it('is true for a lesson, and false for a home or a statement with no plan', () => {
		expect(needsStudentCount(lesson())).toBe(true);
		expect(
			needsStudentCount({ statementSettings: { lessonPlan, classHome: { kind: 'class' } } }),
		).toBe(false);
		expect(needsStudentCount({ statementSettings: {} })).toBe(false);
		expect(needsStudentCount({})).toBe(false);
		expect(needsStudentCount(undefined)).toBe(false);
	});
});

describe('planStudentCount', () => {
	it('writes the count on a lesson that has none yet', () => {
		expect(planStudentCount(lesson(), 23)).toEqual({ action: 'write', count: 23 });
		expect(planStudentCount(lesson(), 0)).toEqual({ action: 'write', count: 0 });
	});

	it('replaces a stale or malformed stored count', () => {
		expect(planStudentCount(lesson(20), 23)).toEqual({ action: 'write', count: 23 });
		expect(planStudentCount(lesson(30), 23)).toEqual({ action: 'write', count: 23 });
		expect(planStudentCount(lesson(2.5), 2)).toEqual({ action: 'write', count: 2 });
		expect(planStudentCount(lesson(-1), 0)).toEqual({ action: 'write', count: 0 });
	});

	it('leaves an exact count alone, so a second run writes nothing', () => {
		expect(planStudentCount(lesson(23), 23)).toEqual({ action: 'unchanged', count: 23 });
		expect(planStudentCount(lesson(0), 0)).toEqual({ action: 'unchanged', count: 0 });
	});

	it('skips what is not a lesson, and a count that is not a count', () => {
		expect(
			planStudentCount({ statementSettings: { lessonPlan, classHome: { kind: 'class' } } }, 4),
		).toEqual({ action: 'skip' });
		expect(planStudentCount({ statementSettings: {} }, 4)).toEqual({ action: 'skip' });
		expect(planStudentCount(undefined, 4)).toEqual({ action: 'skip' });
		expect(planStudentCount(lesson(), -1)).toEqual({ action: 'skip' });
		expect(planStudentCount(lesson(), 1.5)).toEqual({ action: 'skip' });
	});
});

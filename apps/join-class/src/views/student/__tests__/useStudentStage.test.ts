import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { useStudentStage } from '../useStudentStage';

function lesson(): Statement {
	return {
		statementSettings: { lessonPlan: { steps: ['waiting'], stepIndex: 0 } },
	} as unknown as Statement;
}

describe('useStudentStage', () => {
	it('is false without a lesson plan', () => {
		expect(useStudentStage({ statementSettings: {} } as unknown as Statement, false)).toBe(false);
		expect(useStudentStage(null, false)).toBe(false);
	});

	it('is true for a student of a lesson', () => {
		expect(useStudentStage(lesson(), false)).toBe(true);
	});

	it('is false for the teacher unless previewing', () => {
		expect(useStudentStage(lesson(), true)).toBe(false);
		expect(useStudentStage(lesson(), true, '1')).toBe(true);
	});
});

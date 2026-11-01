import { describe, it, expect } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { lessonNameOf, linkOf } from '../lessonLinks';

function lesson(classLesson?: Record<string, unknown>): Statement {
	return {
		statementId: 's1',
		statement: 'בריונות',
		statementSettings: classLesson ? { classLesson } : {},
	} as unknown as Statement;
}

describe('lessonLinks lessonName', () => {
	it('reads the name the teacher gave, trimmed', () => {
		const l = lesson({
			planId: 'p',
			gameId: 'g',
			classId: 'c',
			className: 'ט׳3',
			lessonName: ' בריונות עם ט 3 ',
		});
		expect(linkOf(l).lessonName).toBe('בריונות עם ט 3');
		expect(lessonNameOf(l)).toBe('בריונות עם ט 3');
	});

	it('an older lesson shows its own title, as today', () => {
		const l = lesson({ planId: 'p', gameId: 'g', classId: 'c', className: 'ט׳3' });
		expect(linkOf(l).lessonName).toBe('');
		expect(lessonNameOf(l)).toBe('בריונות');
		expect(lessonNameOf(lesson())).toBe('בריונות');
	});
});

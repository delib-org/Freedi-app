import { lessonLookOf } from '../models/classroom/classroomLogic';

describe('lessonLookOf', () => {
	it('is game when the lesson has no look', () => {
		expect(lessonLookOf(null)).toBe('game');
		expect(lessonLookOf(undefined)).toBe('game');
		expect(lessonLookOf({})).toBe('game');
		expect(lessonLookOf({ statementSettings: {} })).toBe('game');
	});

	it('is solid only when the teacher chose solid', () => {
		expect(lessonLookOf({ statementSettings: { lessonLook: 'solid' } })).toBe('solid');
		expect(lessonLookOf({ statementSettings: { lessonLook: 'game' } })).toBe('game');
	});
});

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../db', () => ({ db: {} }));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue: {
		increment: jest.fn(),
		arrayUnion: jest.fn(),
		arrayRemove: jest.fn(),
		delete: jest.fn(),
	},
}));
jest.mock('../joinCodes', () => ({ generateUniqueClassCode: async () => '123456' }));

import * as classes from '../classes';
import * as lookup from '../teacherLookup';

describe('the rules a class lives by', () => {
	it('names are trimmed and capped', () => {
		expect(classes.cleanClassName("  ז'2  ", 'class')).toBe("ז'2");
		expect(() => classes.cleanClassName('   ', 'class')).toThrow(/needs a name/);
		expect(() => classes.cleanClassName('x'.repeat(500), 'class')).toThrow(/needs a name/);
		expect(classes.cleanGradeLevel('  ')).toBeUndefined();
		expect(classes.cleanGradeLevel(' ז ')).toBe('ז');
	});

	it('reads the teacher indexes, absent as empty', () => {
		expect(classes.isSchoolTeacher({}, 'u1')).toBe(false);
		expect(classes.isSchoolTeacher({ teacherMap: { u1: true } }, 'u1')).toBe(true);
		expect(classes.isClassTeacher({ teacherMap: { u1: true } }, 'u2')).toBe(false);
	});

	it('picks the school a new class goes in', () => {
		const one = [{ schoolId: 's1', status: 'active' as const }];
		const two = [...one, { schoolId: 's2', status: 'active' as const }];
		const archived = [{ schoolId: 's1', status: 'archived' as const }];
		expect(classes.pickSchoolForTeacher(one, undefined)).toEqual({ ok: true, schoolId: 's1' });
		expect(classes.pickSchoolForTeacher(two, undefined)).toEqual({
			ok: false,
			reason: 'ambiguous',
		});
		expect(classes.pickSchoolForTeacher(two, 's2')).toEqual({ ok: true, schoolId: 's2' });
		expect(classes.pickSchoolForTeacher(two, 's9')).toEqual({ ok: false, reason: 'not-yours' });
		expect(classes.pickSchoolForTeacher([], undefined)).toEqual({ ok: false, reason: 'none' });
		expect(classes.pickSchoolForTeacher(archived, undefined)).toEqual({
			ok: false,
			reason: 'none',
		});
	});

	it('never lets the last teacher leave', () => {
		expect(classes.canRemoveTeacher(['a', 'b'], 'a')).toBe(true);
		expect(classes.canRemoveTeacher(['a'], 'a')).toBe(false);
		expect(classes.canRemoveTeacher(['a', 'b'], 'c')).toBe(false);
	});

	it('names a co-teacher without leaking the email', () => {
		expect(lookup.displayNameOf('uid123456', { displayName: ' Dana ' })).toBe('Dana');
		expect(lookup.displayNameOf('uid123456', { email: 'teacher@school.org' })).toBe(
			't…r@school.org',
		);
		expect(lookup.displayNameOf('uid123456', { email: 'ab@x.io' })).toBe('a…@x.io');
		expect(lookup.displayNameOf('uid123456', undefined)).toBe('uid123');
	});
});

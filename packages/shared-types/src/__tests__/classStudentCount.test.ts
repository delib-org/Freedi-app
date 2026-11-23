import { studentCountOf } from '../models/classroom/classroomLogic';

describe('studentCountOf (Trello sN881XCU)', () => {
	it('reads the server count of the lesson', () => {
		expect(studentCountOf({ statementSettings: { studentCount: 23 } })).toBe(23);
		expect(studentCountOf({ statementSettings: { studentCount: 0 } })).toBe(0);
	});

	it('is null while the server has not counted the lesson', () => {
		expect(studentCountOf(undefined)).toBeNull();
		expect(studentCountOf(null)).toBeNull();
		expect(studentCountOf({})).toBeNull();
		expect(studentCountOf({ statementSettings: null })).toBeNull();
		expect(studentCountOf({ statementSettings: {} })).toBeNull();
	});

	it('refuses a value that is not a whole, non-negative number', () => {
		expect(studentCountOf({ statementSettings: { studentCount: -1 } })).toBeNull();
		expect(studentCountOf({ statementSettings: { studentCount: 2.5 } })).toBeNull();
		expect(studentCountOf({ statementSettings: { studentCount: Number.NaN } })).toBeNull();
	});
});

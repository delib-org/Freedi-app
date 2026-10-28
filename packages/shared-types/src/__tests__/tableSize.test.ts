import { tableSizeOf } from '../models/classroom/classroomLogic';
import {
	DEFAULT_TABLE_SIZE,
	MAX_TABLE_SIZE,
	MIN_TABLE_SIZE,
} from '../models/classroom/classroomModel';

describe('tableSizeOf', () => {
	it('is 6 when nothing is saved', () => {
		expect(DEFAULT_TABLE_SIZE).toBe(6);
		expect(tableSizeOf(null)).toBe(6);
		expect(tableSizeOf(undefined)).toBe(6);
		expect(tableSizeOf({})).toBe(6);
		expect(tableSizeOf({ statementSettings: {} })).toBe(6);
	});

	it('returns the saved size inside 2..8', () => {
		expect(tableSizeOf({ statementSettings: { tableSize: MIN_TABLE_SIZE } })).toBe(2);
		expect(tableSizeOf({ statementSettings: { tableSize: 5 } })).toBe(5);
		expect(tableSizeOf({ statementSettings: { tableSize: MAX_TABLE_SIZE } })).toBe(8);
	});

	it('falls back to the default for an unusable value', () => {
		expect(tableSizeOf({ statementSettings: { tableSize: 1 } })).toBe(6);
		expect(tableSizeOf({ statementSettings: { tableSize: 9 } })).toBe(6);
		expect(tableSizeOf({ statementSettings: { tableSize: 4.5 } })).toBe(6);
	});
});

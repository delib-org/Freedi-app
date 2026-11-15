import { tableSizeOf } from '../models/classroom/classroomLogic';
import {
	isTableAlone,
	isRegistrationConnectable,
	presentCountOf,
	seatsPerTableOf,
	takenSeatsOf,
} from '../models/classroom/classRegistrationLogic';
import {
	DEFAULT_TABLE_SIZE,
	MAX_TABLE_SIZE,
	MIN_TABLE_SIZE,
	STORED_MIN_TABLE_SIZE,
} from '../models/classroom/classroomModel';
import {
	TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
} from '../models/tableAssignment/tableAssignmentModel';

describe('seats per table: one range in both apps (IA tables-class-bridge 2.2)', () => {
	it('is 3..20, default 7, in Class and in Tables', () => {
		expect([MIN_TABLE_SIZE, MAX_TABLE_SIZE, DEFAULT_TABLE_SIZE]).toEqual([3, 20, 7]);
		expect([MIN_TABLE_SIZE, MAX_TABLE_SIZE, DEFAULT_TABLE_SIZE]).toEqual([
			TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
			TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
			TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
		]);
	});
});

describe('tableSizeOf', () => {
	it('is 7 when nothing is saved', () => {
		expect(tableSizeOf(null)).toBe(7);
		expect(tableSizeOf(undefined)).toBe(7);
		expect(tableSizeOf({})).toBe(7);
		expect(tableSizeOf({ statementSettings: {} })).toBe(7);
	});

	it('returns the saved size inside 2..20 (2 only from older lessons)', () => {
		expect(tableSizeOf({ statementSettings: { tableSize: STORED_MIN_TABLE_SIZE } })).toBe(2);
		expect(tableSizeOf({ statementSettings: { tableSize: 5 } })).toBe(5);
		expect(tableSizeOf({ statementSettings: { tableSize: MAX_TABLE_SIZE } })).toBe(20);
	});

	it('falls back to the default for an unusable value', () => {
		expect(tableSizeOf({ statementSettings: { tableSize: 1 } })).toBe(7);
		expect(tableSizeOf({ statementSettings: { tableSize: 21 } })).toBe(7);
		expect(tableSizeOf({ statementSettings: { tableSize: 4.5 } })).toBe(7);
	});
});

describe('seatsPerTableOf', () => {
	const connected = (seatsPerTable?: number) => ({
		statementSettings: {
			tableSize: 4,
			classRegistration: { tableAssignmentId: 's', connectedAt: 1, seatsPerTable },
		},
	});

	it("reads the registration's number in a connected lesson, never the lesson's own", () => {
		expect(seatsPerTableOf(connected(12))).toBe(12);
		expect(seatsPerTableOf(connected(), 9)).toBe(9);
		expect(seatsPerTableOf(connected())).toBe(DEFAULT_TABLE_SIZE);
	});

	it("reads the lesson's own setting when not connected", () => {
		expect(seatsPerTableOf({ statementSettings: { tableSize: 4 } }, 9)).toBe(4);
	});
});

describe('seat counting', () => {
	const table = {
		memberUids: ['a'],
		noDeviceMembers: [{ id: 'nd_1', name: 'No phone' }],
		reservedSeats: [{ seatId: 's1', name: 'Not here' }],
	};

	it('counts present people and taken seats apart', () => {
		expect(presentCountOf(table)).toBe(2);
		expect(takenSeatsOf(table)).toBe(3);
	});

	it('flags a table with one person present, reserved seats aside', () => {
		expect(isTableAlone({ ...table, noDeviceMembers: [] })).toBe(true);
		expect(isTableAlone(table)).toBe(false);
		expect(isTableAlone({ memberUids: [], noDeviceMembers: [] })).toBe(false);
	});
});

describe('isRegistrationConnectable', () => {
	it('lists a registration that is not ended and not connected to another lesson', () => {
		expect(isRegistrationConnectable({ status: 'registrationOpen' }, 'L')).toBe(true);
		expect(isRegistrationConnectable({ status: 'published', contextStatementId: 'L' }, 'L')).toBe(
			true,
		);
		expect(isRegistrationConnectable({ status: 'published', contextStatementId: 'X' }, 'L')).toBe(
			false,
		);
		expect(isRegistrationConnectable({ status: 'ended' }, 'L')).toBe(false);
	});
});

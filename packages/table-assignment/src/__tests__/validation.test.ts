import { assignTables } from '../assignTables';
import { TableAssignmentError } from '../errors';
import type { AssignmentOptions, Participant, Topic } from '../types';

const TOPICS: Topic[] = [{ id: 'a' }, { id: 'b' }];
const PEOPLE: Participant[] = Array.from({ length: 6 }, (_, i) => ({
	id: `p${i}`,
	side: [i * 20],
	preferences: ['a'],
}));

function run(
	options: AssignmentOptions = {},
	participants: readonly Participant[] = PEOPLE,
	topics: readonly Topic[] = TOPICS,
): unknown {
	return assignTables(participants, topics, { seed: 1, ...options });
}

describe('input checks', () => {
	it.each([
		['NaN restarts', { restarts: Number.NaN }],
		['fractional restarts', { restarts: 1.5 }],
		['NaN maxRankedPreferences', { maxRankedPreferences: Number.NaN }],
		['fractional maxRankedPreferences', { maxRankedPreferences: 2.5 }],
		['negative maxRankedPreferences', { maxRankedPreferences: -1 }],
		['NaN balanceTolerance', { balanceTolerance: Number.NaN }],
		['NaN tableSize', { tableSize: Number.NaN }],
		['NaN maxSwapTries', { maxSwapTries: Number.NaN }],
	])('rejects %s', (_label, options) => {
		expect(() => run(options)).toThrow(TableAssignmentError);
	});

	it.each([
		['fractional maxTables', 1.5],
		['negative maxTables', -1],
		['NaN maxTables', Number.NaN],
	])('rejects %s on a topic', (_label, maxTables) => {
		expect(() => run({}, PEOPLE, [{ id: 'a', maxTables }, { id: 'b' }])).toThrow(TableAssignmentError);
	});

	it('rejects a NaN side value', () => {
		const people = [...PEOPLE, { id: 'x', side: [Number.NaN], preferences: [] }];
		expect(() => run({}, people)).toThrow(TableAssignmentError);
	});

	it('rejects a missing or non-array preferences list', () => {
		const missing = { id: 'x', side: [10] } as unknown as Participant;
		const notArray = { id: 'y', side: [10], preferences: 'a' } as unknown as Participant;
		expect(() => run({}, [...PEOPLE, missing])).toThrow(TableAssignmentError);
		expect(() => run({}, [...PEOPLE, notArray])).toThrow(TableAssignmentError);
	});

	it('still accepts an infinite tolerance and a well-formed call', () => {
		expect(() => run({ balanceTolerance: Number.POSITIVE_INFINITY })).not.toThrow();
		expect(() => run({ restarts: 2, maxRankedPreferences: 0, tableSize: 3 })).not.toThrow();
		expect(() => run({}, PEOPLE, [{ id: 'a', maxTables: 3 }, { id: 'b' }])).not.toThrow();
	});
});

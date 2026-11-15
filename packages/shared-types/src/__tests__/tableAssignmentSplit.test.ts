import {
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
	isTableAssignmentSplitByTopic,
	tableAssignmentTableSizes,
	tableAssignmentTopicCountOf,
} from '../models/tableAssignment/tableAssignmentModel';

describe('tableAssignmentTableSizes (the split rule, IA tables-class-bridge 2.1)', () => {
	it('gives the examples of the spec', () => {
		expect(tableAssignmentTableSizes(70, 7)).toEqual(Array(10).fill(7));
		expect(tableAssignmentTableSizes(71, 7)).toEqual([7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6]);
	});

	it('opens no table for nobody', () => {
		expect(tableAssignmentTableSizes(0, 7)).toEqual([]);
	});

	it('keeps sizes within one and never leaves one person alone, for every size 3..20', () => {
		for (
			let size = TABLE_ASSIGNMENT_TABLE_SIZE_MIN;
			size <= TABLE_ASSIGNMENT_TABLE_SIZE_MAX;
			size++
		) {
			for (let people = 2; people <= 200; people++) {
				const sizes = tableAssignmentTableSizes(people, size);
				expect(sizes).toHaveLength(Math.ceil(people / size));
				expect(sizes.reduce((a, b) => a + b, 0)).toBe(people);
				expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
				expect(Math.max(...sizes)).toBeLessThanOrEqual(size);
				expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('gives the one person of a topic a table of one (the host is flagged)', () => {
		expect(tableAssignmentTableSizes(1, 7)).toEqual([1]);
	});
});

describe('topic count and split mode readers', () => {
	it('reads anything but "one" as several', () => {
		expect(tableAssignmentTopicCountOf(undefined)).toBe('several');
		expect(tableAssignmentTopicCountOf({})).toBe('several');
		expect(tableAssignmentTopicCountOf({ topicCount: 'weird' })).toBe('several');
		expect(tableAssignmentTopicCountOf({ topicCount: 'one' })).toBe('one');
	});

	it('is split by topic only for a direct session that carries the flag', () => {
		expect(isTableAssignmentSplitByTopic({ mode: 'direct', splitByTopic: true })).toBe(true);
		expect(isTableAssignmentSplitByTopic({ mode: 'direct' })).toBe(false);
		expect(isTableAssignmentSplitByTopic({ mode: 'ranked', splitByTopic: true })).toBe(false);
	});
});

// setupTests.ts mocks valibot globally; these tests need the real validators.
jest.unmock('valibot');

import { parse, safeParse } from 'valibot';
import { Collections } from '../models/collections/collectionsModel';
import {
	TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
	TableAssignmentParticipantSchema,
	TableAssignmentRunSchema,
	TableAssignmentSchema,
	TableAssignmentSettingsSchema,
	TableAssignmentTopicSchema,
	tableAssignmentParticipantId,
} from '../models/tableAssignment/tableAssignmentModel';

const NOW = 1_700_000_000_000;

const validParticipant = {
	sessionId: 's1',
	uid: 'u1',
	fullName: 'Dana Levi',
	preferences: ['t1', 't2', 't3'],
	position: 40,
	registeredAt: NOW,
};

describe('TableAssignmentSettingsSchema', () => {
	it('fills the defaults', () => {
		const settings = parse(TableAssignmentSettingsSchema, {});
		expect(settings.tableSize).toBe(TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT);
		expect(settings.balanceTolerance).toBe(TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT);
		expect(settings.positionQuestion).toBeUndefined();
	});
});

describe('input bounds', () => {
	it('rejects table sizes 1 and 21 and accepts 2 and 20', () => {
		expect(safeParse(TableAssignmentSettingsSchema, { tableSize: 1 }).success).toBe(false);
		expect(safeParse(TableAssignmentSettingsSchema, { tableSize: 21 }).success).toBe(false);
		expect(safeParse(TableAssignmentSettingsSchema, { tableSize: 2 }).success).toBe(true);
		expect(safeParse(TableAssignmentSettingsSchema, { tableSize: 20 }).success).toBe(true);
	});

	it('rejects an empty full name', () => {
		expect(
			safeParse(TableAssignmentParticipantSchema, { ...validParticipant, fullName: '' }).success,
		).toBe(false);
	});

	it('rejects an empty session title and a negative timestamp', () => {
		const session = {
			tableAssignmentId: 'a1',
			hostUid: 'h1',
			title: 'Tables',
			mode: 'direct',
			status: 'draft',
			settings: {},
			createdAt: NOW,
			lastUpdate: NOW,
		};

		expect(safeParse(TableAssignmentSchema, { ...session, title: '' }).success).toBe(false);
		expect(safeParse(TableAssignmentSchema, { ...session, createdAt: -1 }).success).toBe(false);
	});
});

describe('TableAssignmentSchema', () => {
	const valid = {
		tableAssignmentId: 'a1',
		hostUid: 'h1',
		title: 'Evening tables',
		mode: 'ranked',
		status: 'draft',
		settings: {},
		createdAt: NOW,
		lastUpdate: NOW,
	};

	it('parses a valid session', () => {
		expect(safeParse(TableAssignmentSchema, valid).success).toBe(true);
	});

	it('rejects an unknown status and mode', () => {
		expect(safeParse(TableAssignmentSchema, { ...valid, status: 'open' }).success).toBe(false);
		expect(safeParse(TableAssignmentSchema, { ...valid, mode: 'lottery' }).success).toBe(false);
	});
});

describe('TableAssignmentTopicSchema', () => {
	it('parses a topic and rejects a negative order', () => {
		const topic = { topicId: 't1', sessionId: 's1', title: 'Housing', order: 0 };
		expect(safeParse(TableAssignmentTopicSchema, topic).success).toBe(true);
		expect(safeParse(TableAssignmentTopicSchema, { ...topic, order: -1 }).success).toBe(false);
	});
});

describe('TableAssignmentParticipantSchema', () => {
	it('parses a valid participant', () => {
		expect(safeParse(TableAssignmentParticipantSchema, validParticipant).success).toBe(true);
	});

	it('accepts a participant with no position', () => {
		const { position: _position, ...rest } = validParticipant;
		expect(safeParse(TableAssignmentParticipantSchema, rest).success).toBe(true);
	});

	it('rejects four preferences', () => {
		const bad = { ...validParticipant, preferences: ['a', 'b', 'c', 'd'] };
		expect(safeParse(TableAssignmentParticipantSchema, bad).success).toBe(false);
	});

	it('rejects a position outside 0..100', () => {
		expect(
			safeParse(TableAssignmentParticipantSchema, { ...validParticipant, position: 101 }).success,
		).toBe(false);
		expect(
			safeParse(TableAssignmentParticipantSchema, { ...validParticipant, position: -1 }).success,
		).toBe(false);
	});

	it('builds the participant doc id', () => {
		expect(tableAssignmentParticipantId('s1', 'u1')).toBe('s1_u1');
	});
});

describe('TableAssignmentRunSchema', () => {
	const stats = { n: 2, mean: [50], sd: [10], deviation: 0.1 };
	const valid = {
		runId: 'r1',
		sessionId: 's1',
		seed: 7,
		status: 'ready',
		tables: [{ index: 0, topicId: 't1', memberUids: ['u1', 'u2'], stats }],
		metrics: {
			population: { n: 2, mean: [50], sd: [10] },
			balance: { max: 0.1, mean: 0.1, tolerance: 0.3, withinTolerance: true },
			preferences: { byRank: [2, 0, 0], none: 0, noPreference: 0, score: 6, maxScore: 6 },
		},
		inputHash: 'abc',
		createdAt: NOW,
	};

	it('parses a valid run', () => {
		expect(safeParse(TableAssignmentRunSchema, valid).success).toBe(true);
	});

	it('rejects an unknown run status', () => {
		expect(safeParse(TableAssignmentRunSchema, { ...valid, status: 'draft' }).success).toBe(false);
	});
});

describe('Collections', () => {
	it('has the Tables collections', () => {
		expect(Collections.tableAssignments).toBe('tableAssignments');
		expect(Collections.tableAssignmentTopics).toBe('tableAssignmentTopics');
		expect(Collections.tableAssignmentParticipants).toBe('tableAssignmentParticipants');
		expect(Collections.tableAssignmentRuns).toBe('tableAssignmentRuns');
	});
});

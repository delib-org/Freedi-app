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
	TableAssignmentCounterSchema,
	TableAssignmentRosterEntrySchema,
	TableAssignmentTopicSchema,
	tableAssignmentNameKey,
	tableAssignmentParticipantId,
} from '../models/tableAssignment/tableAssignmentModel';
import { tableAssignmentCloseness } from '../models/tableAssignment/tableAssignmentCloseness';

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

	it('parses a run in the stored shape: closeness per table, empty figures', () => {
		const empty = { n: 0, mean: [], sd: [], deviation: 0 };
		const stored = {
			...valid,
			tables: [{ ...valid.tables[0], stats: empty, closeness: 'close' }],
			metrics: {
				...valid.metrics,
				population: { n: 0, mean: [], sd: [] },
				balance: { max: 0, mean: 0, tolerance: 0.3, withinTolerance: true },
				hasEnoughPositions: true,
			},
		};

		expect(safeParse(TableAssignmentRunSchema, stored).success).toBe(true);
	});

	it('rejects an unknown closeness', () => {
		const tables = [{ ...valid.tables[0], closeness: 'near' }];

		expect(safeParse(TableAssignmentRunSchema, { ...valid, tables }).success).toBe(false);
	});
});

describe('tableAssignmentCloseness', () => {
	const tolerance = 0.3;

	it('says nothing below three known positions, however far the table is', () => {
		expect(tableAssignmentCloseness({ n: 2, deviation: 5 }, tolerance)).toBe('notEnough');
	});

	it('reads very close up to half the tolerance, close up to the tolerance, far past it', () => {
		expect(tableAssignmentCloseness({ n: 3, deviation: 0.15 }, tolerance)).toBe('veryClose');
		expect(tableAssignmentCloseness({ n: 3, deviation: 0.16 }, tolerance)).toBe('close');
		expect(tableAssignmentCloseness({ n: 3, deviation: 0.3 }, tolerance)).toBe('close');
		expect(tableAssignmentCloseness({ n: 3, deviation: 0.31 }, tolerance)).toBe('far');
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

describe('redesign fields on older documents', () => {
	it('parses settings without the new fields and leaves them absent', () => {
		const settings = parse(TableAssignmentSettingsSchema, { tableSize: 5, balanceTolerance: 0.3 });

		expect(settings.expectedParticipants).toBeUndefined();
		expect(settings.allowReturnByName).toBeUndefined();
	});

	it('accepts the new settings and refuses fewer than one expected person', () => {
		expect(
			safeParse(TableAssignmentSettingsSchema, {
				expectedParticipants: 42,
				allowReturnByName: true,
			}).success,
		).toBe(true);
		expect(safeParse(TableAssignmentSettingsSchema, { expectedParticipants: 0 }).success).toBe(
			false,
		);
	});

	it('parses a private record with and without the claim flag', () => {
		expect(parse(TableAssignmentParticipantSchema, validParticipant).claimedByName).toBeUndefined();
		expect(
			parse(TableAssignmentParticipantSchema, { ...validParticipant, claimedByName: true })
				.claimedByName,
		).toBe(true);
	});
});

describe('name card and counter schemas', () => {
	const card = {
		sessionId: 's1',
		uid: 'u1',
		fullName: 'Dana Levi',
		nameKey: 'dana levi',
		registeredAt: NOW,
		hasPreferences: false,
	};

	it('parses a name card, with or without a direct-mode table', () => {
		expect(safeParse(TableAssignmentRosterEntrySchema, card).success).toBe(true);
		expect(
			safeParse(TableAssignmentRosterEntrySchema, { ...card, chosenTableIndex: 2 }).success,
		).toBe(true);
	});

	it('has no field for an answer: a position does not survive parsing', () => {
		const parsed = parse(TableAssignmentRosterEntrySchema, { ...card, position: 40 });

		expect(parsed).not.toHaveProperty('position');
		expect(parsed).not.toHaveProperty('preferences');
	});

	it('refuses a negative counter', () => {
		expect(
			safeParse(TableAssignmentCounterSchema, { sessionId: 's1', registered: -1 }).success,
		).toBe(false);
	});
});

describe('tableAssignmentNameKey', () => {
	it.each([
		['  Dana   Levi ', 'dana levi'],
		['DANA levi', 'dana levi'],
		['דנה   לוי', 'דנה לוי'],
		[' دانا  ليفي ', 'دانا ليفي'],
		['Dana Levi', 'dana levi'],
		['Dana\tLevi\n', 'dana levi'],
	])('reduces %j to %j', (input, expected) => {
		expect(tableAssignmentNameKey(input)).toBe(expected);
	});

	it('treats composed and compatibility forms as one name', () => {
		expect(tableAssignmentNameKey('Ｄａｎａ')).toBe('dana');
		expect(tableAssignmentNameKey('é')).toBe(tableAssignmentNameKey('é'));
	});

	it('keeps different names apart', () => {
		expect(tableAssignmentNameKey('דנה לוי')).not.toBe(tableAssignmentNameKey('דנה כהן'));
	});
});

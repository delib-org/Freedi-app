// setupTests.ts mocks valibot globally; these tests need the real validators.
jest.unmock('valibot');

import { parse, safeParse } from 'valibot';
import {
	TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH,
	TableAssignmentEventSchema,
	TableAssignmentSchema,
	TableAssignmentSettingsSchema,
} from '../models/tableAssignment/tableAssignmentModel';

const NOW = 1_700_000_000_000;

const oldSession = {
	tableAssignmentId: 's1',
	hostUid: 'h1',
	title: 'Evening',
	mode: 'ranked',
	status: 'draft',
	settings: { tableSize: 7, balanceTolerance: 0.3 },
	createdAt: NOW,
	lastUpdate: NOW,
};

describe('TableAssignmentEventSchema', () => {
	it('accepts every combination of the three optional parts', () => {
		expect(safeParse(TableAssignmentEventSchema, {}).success).toBe(true);
		expect(safeParse(TableAssignmentEventSchema, { date: '2027-03-19' }).success).toBe(true);
		expect(safeParse(TableAssignmentEventSchema, { time: '17:00' }).success).toBe(true);
		expect(safeParse(TableAssignmentEventSchema, { place: 'Community club' }).success).toBe(true);
		expect(
			safeParse(TableAssignmentEventSchema, { date: '2027-03-19', time: '09:05', place: 'Club' })
				.success,
		).toBe(true);
	});

	it.each(['2027-3-19', '19/03/2027', '2027-13-01', '2027-00-10', '2027-03-32', ''])(
		'rejects the date %j',
		(date) => {
			expect(safeParse(TableAssignmentEventSchema, { date }).success).toBe(false);
		},
	);

	it.each(['7:00', '24:00', '17:60', '17', '17:00:00', ''])('rejects the time %j', (time) => {
		expect(safeParse(TableAssignmentEventSchema, { time }).success).toBe(false);
	});

	it('caps the place and refuses an empty one', () => {
		const longest = 'x'.repeat(TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH);

		expect(safeParse(TableAssignmentEventSchema, { place: longest }).success).toBe(true);
		expect(safeParse(TableAssignmentEventSchema, { place: `${longest}x` }).success).toBe(false);
		expect(safeParse(TableAssignmentEventSchema, { place: '' }).success).toBe(false);
	});
});

describe('settings.event on stored sessions', () => {
	it('parses a session saved before the event existed', () => {
		const session = parse(TableAssignmentSchema, oldSession);

		expect(session.settings.event).toBeUndefined();
	});

	it('keeps the event through settings and session parsing', () => {
		const event = { date: '2027-03-19', time: '17:00', place: 'Community club' };

		expect(parse(TableAssignmentSettingsSchema, { event }).event).toEqual(event);
		expect(
			parse(TableAssignmentSchema, { ...oldSession, settings: { event } }).settings.event,
		).toEqual(event);
	});
});

import { TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH } from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { createSession } from '../fn_tablesCreateSession';
import { saveSettings } from '../fn_tablesSaveSettings';
import { TablesError } from '../tablesErrors';
import { normalizeEvent, parseSettings } from '../validation';

const HOST = 'host-1';
const SID = 'session-1';
const NOW = 1_800_000_000_000;

function seedSession(
	fake: FakeFirestore,
	settings: Partial<TableAssignment['settings']> = {},
): void {
	fake.seed(`tableAssignments/${SID}`, {
		tableAssignmentId: SID,
		hostUid: HOST,
		title: 'Town hall',
		mode: 'ranked',
		status: 'draft',
		settings: { tableSize: 7, balanceTolerance: 0.3, ...settings },
		createdAt: NOW,
		lastUpdate: NOW,
	});
}

function storedSettings(fake: FakeFirestore): TableAssignment['settings'] {
	const doc = fake.read(`tableAssignments/${SID}`) as TableAssignment;

	return doc.settings;
}

describe('normalizeEvent', () => {
	it('drops empty parts and an event with nothing left', () => {
		expect(normalizeEvent({ date: '', time: '', place: '   ' })).toBeUndefined();
		expect(normalizeEvent(null)).toBeUndefined();
		expect(normalizeEvent({ date: '2027-03-19', time: '', place: ' Club ' })).toEqual({
			date: '2027-03-19',
			place: 'Club',
		});
	});

	it('cleans invisible characters out of the place', () => {
		expect(normalizeEvent({ place: 'Club‮\n' })).toEqual({ place: 'Club' });
	});
});

describe('parseSettings with an event', () => {
	it('keeps the filled parts and omits the event when all are empty', () => {
		expect(parseSettings({ event: { time: '17:00' } }).event).toEqual({ time: '17:00' });
		expect(parseSettings({ event: { date: '', time: '' } }).event).toBeUndefined();
		expect(parseSettings({}).event).toBeUndefined();
	});

	it('refuses a malformed date, time or an over-long place', () => {
		expect(() => parseSettings({ event: { date: '19/03/2027' } })).toThrow(TablesError);
		expect(() => parseSettings({ event: { time: '25:00' } })).toThrow(TablesError);
		expect(() =>
			parseSettings({ event: { place: 'x'.repeat(TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH + 1) } }),
		).toThrow(TablesError);
	});
});

describe('tablesSaveSettings with an event', () => {
	it('stores the event, keeps it when unspoken of, and removes it with null', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		const saved = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			event: { date: '2027-03-19', time: '17:00', place: 'Community club' },
		});

		expect(saved.settings.event).toEqual({
			date: '2027-03-19',
			time: '17:00',
			place: 'Community club',
		});
		expect(storedSettings(fake).event).toEqual(saved.settings.event);

		const untouched = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			tableSize: 5,
		});

		expect(untouched.settings.event).toEqual(saved.settings.event);

		const partial = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			event: { date: '2027-03-19', place: 'Club' },
		});

		expect(partial.settings.event).toEqual({ date: '2027-03-19', place: 'Club' });

		const removed = await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, event: null });

		expect(removed.settings.event).toBeUndefined();
		expect(storedSettings(fake).event).toBeUndefined();
	});

	it('clears the event when every part is empty', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { event: { place: 'Club' } });
		const cleared = await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			event: { place: '  ' },
		});

		expect(cleared.settings.event).toBeUndefined();
	});

	it('refuses a bad time without changing the session', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { event: { place: 'Club' } });
		await expect(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, event: { time: '7pm' } }),
		).rejects.toMatchObject({ code: 'invalid-argument' });
		expect(storedSettings(fake).event).toEqual({ place: 'Club' });
	});

	it('accepts an event when the session is created', async () => {
		const fake = new FakeFirestore();
		const { session } = await createSession(
			fake.asFirestore(),
			{ uid: HOST, hasGoogleAccount: true },
			{ title: 'Evening', mode: 'ranked', settings: { event: { date: '2027-03-19' } } },
			NOW,
		);

		expect(session.settings.event).toEqual({ date: '2027-03-19' });
	});
});

import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import en from '@/lib/locales/en';
import he from '@/lib/locales/he';
import { eventLine, formatEventDate } from '@/logic/eventLine';
import {
	EMPTY_EVENT_DRAFT,
	emptySetupDraft,
	eventFromDraft,
	setupDraftFromSession,
	settingsRequest,
} from '@/logic/setupDraft';
import { readSetupBackup, writeSetupBackup } from '@/logic/setupBackup';
import type { TableAssignment } from '@freedi/shared-types';

type Dictionary = Record<string, string>;

const NOW = new Date(Date.UTC(2027, 0, 10));

function translator(dictionary: Dictionary) {
	return (key: string, params: Record<string, string | number> = {}): string =>
		Object.entries(params).reduce(
			(text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
			dictionary[key] ?? key,
		);
}

const FULL = { date: '2027-03-19', time: '17:00', place: 'Community club' };

describe('formatEventDate', () => {
	it('writes the day in the reader language, without the year in the current year', () => {
		expect(formatEventDate('2027-03-19', 'en', NOW)).toBe('19 March');
		expect(formatEventDate('2027-03-19', 'he', NOW)).toBe('19 במרץ');
		expect(formatEventDate('2027-03-19', 'ar', NOW)).toMatch(/^19 /);
	});

	it('adds the year when it is not the current one', () => {
		expect(formatEventDate('2028-03-19', 'en', NOW)).toBe('19 March 2028');
	});

	it('does not move the day with the time zone', () => {
		expect(formatEventDate('2027-12-31', 'en', NOW)).toBe('31 December');
		expect(formatEventDate('2027-01-01', 'en', NOW)).toBe('1 January');
	});

	it('returns null for text that is not a calendar day', () => {
		expect(formatEventDate('2027-02-30', 'en', NOW)).toBeNull();
		expect(formatEventDate('soon', 'en', NOW)).toBeNull();
	});
});

describe('eventLine', () => {
	const translate = translator(en);

	it('reads naturally with all three parts', () => {
		expect(eventLine(FULL, 'en', translate, NOW)).toBe(
			'See you on 19 March, 17:00 at Community club.',
		);
	});

	it.each([
		[{ date: '2027-03-19' }, 'See you on 19 March.'],
		[{ time: '17:00' }, 'See you at 17:00.'],
		[{ place: 'Community club' }, 'See you at Community club.'],
		[{ date: '2027-03-19', time: '17:00' }, 'See you on 19 March at 17:00.'],
		[{ date: '2027-03-19', place: 'Community club' }, 'See you on 19 March at Community club.'],
		[{ time: '17:00', place: 'Community club' }, 'See you at 17:00, at Community club.'],
	])('shows only the parts that are filled: %j', (event, expected) => {
		expect(eventLine(event, 'en', translate, NOW)).toBe(expected);
	});

	it('says nothing when nothing is filled', () => {
		expect(eventLine(undefined, 'en', translate, NOW)).toBeNull();
		expect(eventLine({}, 'en', translate, NOW)).toBeNull();
		expect(eventLine({ place: '   ' }, 'en', translate, NOW)).toBeNull();
	});

	it('drops a date that is not a real day instead of printing it', () => {
		expect(eventLine({ date: '2027-02-30', time: '17:00' }, 'en', translate, NOW)).toBe(
			'See you at 17:00.',
		);
	});

	it('has a sentence for every combination in every language', () => {
		const shapes: Array<Parameters<typeof eventLine>[0]> = [
			{ date: '2027-03-19' },
			{ time: '17:00' },
			{ place: 'P' },
			{ date: '2027-03-19', time: '17:00' },
			{ date: '2027-03-19', place: 'P' },
			{ time: '17:00', place: 'P' },
			FULL,
		];

		for (const [lang, dictionary] of [
			['he', he],
			['en', en],
			['ar', ar],
		] as const) {
			for (const event of shapes) {
				const line = eventLine(event, lang, translator(dictionary), NOW);

				expect(line).not.toBeNull();
				expect(line).not.toContain('tableAssignment.event');
				expect(line).not.toContain('{{');
			}
		}
	});

	it('writes the Hebrew sentence', () => {
		expect(eventLine(FULL, 'he', translator(he), NOW)).toBe(
			'נתראה ב-19 במרץ בשעה 17:00. המקום: Community club.',
		);
	});
});

describe('the event in the setup draft', () => {
	const session = {
		title: 'Evening',
		mode: 'ranked',
		settings: { tableSize: 7, balanceTolerance: 0.3 },
	} as TableAssignment;

	it('is empty for a session saved before the event existed, and sends null', () => {
		const draft = setupDraftFromSession(session, []);

		expect(draft).toMatchObject(EMPTY_EVENT_DRAFT);
		expect(settingsRequest('s1', draft)?.event).toBeNull();
	});

	it('round-trips the parts through the draft and into the request', () => {
		const draft = setupDraftFromSession(
			{ ...session, settings: { ...session.settings, event: FULL } },
			[],
		);

		expect(draft).toMatchObject({
			eventDate: '2027-03-19',
			eventTime: '17:00',
			eventPlace: 'Community club',
		});
		expect(settingsRequest('s1', draft)?.event).toEqual(FULL);
	});

	it('sends only the filled parts, trimmed', () => {
		expect(eventFromDraft({ eventDate: '', eventTime: ' 17:00 ', eventPlace: '  Club ' })).toEqual({
			time: '17:00',
			place: 'Club',
		});
		expect(eventFromDraft({ eventDate: '', eventTime: '', eventPlace: '   ' })).toBeNull();
	});

	it('reads a saved copy from before the event fields as empty', () => {
		const store = new Map<string, string>();
		const memory = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key),
		};
		const scope = { uid: 'u1', sessionId: 's1' };
		const { eventDate, eventTime, eventPlace, ...oldDraft } = emptySetupDraft();

		void eventDate;
		void eventTime;
		void eventPlace;
		store.set(
			'freedi_tables_setup_s1',
			JSON.stringify({ uid: 'u1', serverUpdate: 1, draft: { ...oldDraft, title: 'Old' } }),
		);

		expect(readSetupBackup(memory, scope, 1)).toMatchObject({ title: 'Old', ...EMPTY_EVENT_DRAFT });

		writeSetupBackup(memory, scope, { ...emptySetupDraft(), eventPlace: 'Club' }, 1);
		expect(readSetupBackup(memory, scope, 1)?.eventPlace).toBe('Club');
	});
});

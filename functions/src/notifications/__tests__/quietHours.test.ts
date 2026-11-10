import type { QuietHours } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { isInQuietHours, loadQuietHours, quietHoursEndAt } from '../quietHours';

const MINUTE = 60 * 1000;
const overnight: QuietHours = {
	enabled: true,
	startTime: '22:00',
	endTime: '08:00',
	timezone: 'UTC',
};
const daytime: QuietHours = { ...overnight, startTime: '09:00', endTime: '17:00' };
const utc = (hour: number, minute = 0) => Date.UTC(2026, 10, 10, hour, minute);

describe('isInQuietHours', () => {
	it.each([
		[23, true],
		[0, true],
		[7, true],
		[8, false],
		[21, false],
	])('overnight window at %i:00 UTC is %s', (hour, expected) => {
		expect(isInQuietHours(overnight, new Date(utc(hour)))).toBe(expected);
	});

	it.each([
		[9, true],
		[16, true],
		[17, false],
		[8, false],
	])('same-day window at %i:00 UTC is %s', (hour, expected) => {
		expect(isInQuietHours(daytime, new Date(utc(hour)))).toBe(expected);
	});

	it('is false when switched off or missing', () => {
		expect(isInQuietHours({ ...overnight, enabled: false }, new Date(utc(23)))).toBe(false);
		expect(isInQuietHours(null)).toBe(false);
		expect(isInQuietHours(undefined)).toBe(false);
	});

	it('reads the time in the person’s own zone', () => {
		const newYork = { ...overnight, timezone: 'America/New_York' };

		// 06:00 UTC is 01:00 in New York in November.
		expect(isInQuietHours(newYork, new Date(utc(6)))).toBe(true);
	});

	it('is false for an invalid time zone rather than throwing', () => {
		expect(isInQuietHours({ ...overnight, timezone: 'Not/AZone' }, new Date(utc(23)))).toBe(false);
	});
});

describe('quietHoursEndAt', () => {
	it('finds the end later the same day', () => {
		expect(quietHoursEndAt(overnight, utc(6))).toBe(utc(8));
	});

	it('crosses midnight', () => {
		expect(quietHoursEndAt(overnight, utc(23))).toBe(utc(23) + 9 * 60 * MINUTE);
	});

	it('uses the person’s own zone', () => {
		const newYork = { ...overnight, timezone: 'America/New_York' };

		// 08:00 in New York is 13:00 UTC in November.
		expect(quietHoursEndAt(newYork, utc(6))).toBe(utc(13));
	});

	it('is never in the past or now', () => {
		expect(quietHoursEndAt(overnight, utc(8))).toBeGreaterThan(utc(8));
	});
});

describe('loadQuietHours', () => {
	function fakeDb(
		settings: Record<string, unknown>,
		tokens: Record<string, unknown> = {},
		failFor?: string,
	): Firestore {
		return {
			collection: () => ({
				doc: (id: string) => ({
					get: async () => {
						if (id === failFor) throw new Error('unavailable');

						return { exists: id in settings, data: () => settings[id] };
					},
				}),
				where: (_field: string, _op: string, userId: string) => ({
					limit: () => ({
						get: async () => ({
							empty: !(userId in tokens),
							docs: [{ data: () => tokens[userId] }],
						}),
					}),
				}),
			}),
		} as unknown as Firestore;
	}

	it('reads the person’s settings first', async () => {
		const result = await loadQuietHours(fakeDb({ a: { quietHours: overnight } }), ['a']);

		expect(result.get('a')).toEqual(overnight);
	});

	it('falls back to the value on the device', async () => {
		const result = await loadQuietHours(fakeDb({}, { a: { quietHours: daytime } }), ['a']);

		expect(result.get('a')).toEqual(daytime);
	});

	it('is null with neither', async () => {
		expect((await loadQuietHours(fakeDb({}), ['a'])).get('a')).toBeNull();
	});

	it('counts a failed read as no quiet hours', async () => {
		expect((await loadQuietHours(fakeDb({}, {}, 'a'), ['a'])).get('a')).toBeNull();
	});
});

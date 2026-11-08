import { TIME } from '@/constants/common';
import { formatRelativeTime } from '../relativeTime';

const NOW = Date.UTC(2026, 10, 1, 12);

describe('formatRelativeTime', () => {
	it('reads under a minute as one minute ago', () => {
		expect(formatRelativeTime(NOW - 10 * TIME.SECOND, NOW, 'en')).toBe('1 minute ago');
	});

	it('uses hours under a day', () => {
		expect(formatRelativeTime(NOW - 2 * TIME.HOUR, NOW, 'en')).toBe('2 hours ago');
	});

	it('says yesterday for one day', () => {
		expect(formatRelativeTime(NOW - TIME.DAY, NOW, 'en')).toBe('yesterday');
	});

	it('uses months and years for old requests', () => {
		expect(formatRelativeTime(NOW - 2 * TIME.MONTH, NOW, 'en')).toBe('2 months ago');
		expect(formatRelativeTime(NOW - 400 * TIME.DAY, NOW, 'en')).toBe('last year');
	});

	it('treats a timestamp in the future as just now', () => {
		expect(formatRelativeTime(NOW + TIME.HOUR, NOW, 'en')).toBe('1 minute ago');
	});

	it('speaks the reader language', () => {
		expect(formatRelativeTime(NOW - 3 * TIME.DAY, NOW, 'he')).toMatch(/לפני 3 ימים/);
	});
});

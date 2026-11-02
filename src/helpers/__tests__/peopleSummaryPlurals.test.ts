import { readFileSync } from 'fs';
import { join } from 'path';
import { translateCount } from '../translateCount';

const LANGUAGES = ['en', 'de', 'es', 'fa', 'he', 'ar', 'nl'] as const;
const SUMMARY_KEYS = ['members', 'hosts', 'questions', 'waiting', 'toReview'] as const;
const LANGUAGES_DIR = join(process.cwd(), 'packages', 'shared-i18n', 'src', 'languages');

function loadLanguage(language: string): Record<string, string> {
	return JSON.parse(readFileSync(join(LANGUAGES_DIR, `${language}.json`), 'utf8')) as Record<
		string,
		string
	>;
}

describe('people.summary plurals', () => {
	describe.each(LANGUAGES)('%s', (language) => {
		const dictionary = loadLanguage(language);
		const t = (key: string): string => dictionary[key] ?? key;

		it.each(SUMMARY_KEYS)('has _one and _other for %s and no flat key', (key) => {
			const base = `people.summary.${key}`;

			expect(typeof dictionary[`${base}_one`]).toBe('string');
			expect(typeof dictionary[`${base}_other`]).toBe('string');
			expect(dictionary[base]).toBeUndefined();
		});

		it.each(SUMMARY_KEYS)('%s fills the count and leaves no placeholder', (key) => {
			const base = `people.summary.${key}`;

			expect(translateCount(t, base, 2)).toContain('2');
			expect(translateCount(t, base, 2)).not.toContain('{{');
			expect(translateCount(t, base, 1)).not.toContain('{{');
		});
	});

	it('reads the singular for one and the plural for two in English', () => {
		const dictionary = loadLanguage('en');
		const t = (key: string): string => dictionary[key] ?? key;

		expect(translateCount(t, 'people.summary.members', 1)).toBe('1 member');
		expect(translateCount(t, 'people.summary.members', 2)).toBe('2 members');
		expect(translateCount(t, 'people.summary.hosts', 1)).toBe('1 host');
		expect(translateCount(t, 'people.summary.hosts', 2)).toBe('2 hosts');
	});

	it('reads the singular for one in Hebrew and Arabic', () => {
		const he = loadLanguage('he');
		const ar = loadLanguage('ar');

		expect(translateCount((k) => he[k] ?? k, 'people.summary.members', 1)).toBe('חבר/ה אחד/ת');
		expect(translateCount((k) => he[k] ?? k, 'people.summary.members', 2)).toBe('2 חברים/ות');
		expect(translateCount((k) => ar[k] ?? k, 'people.summary.members', 1)).toBe('عضو واحد');
		expect(translateCount((k) => ar[k] ?? k, 'people.summary.members', 12)).toBe('12 من الأعضاء');
	});
});

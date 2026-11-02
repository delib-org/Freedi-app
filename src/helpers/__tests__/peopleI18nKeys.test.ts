import * as fs from 'node:fs';
import * as path from 'node:path';

const LANGUAGES_DIR = path.resolve(__dirname, '../../../packages/shared-i18n/src/languages');
const load = (lang: string): Record<string, string> =>
	JSON.parse(fs.readFileSync(path.join(LANGUAGES_DIR, `${lang}.json`), 'utf8'));
const en = load('en');
const [he, ar, de, es, fa, nl] = ['he', 'ar', 'de', 'es', 'fa', 'nl'].map(load);

type Dictionary = Record<string, string>;

const others: Record<string, Dictionary> = { he, ar, de, es, fa, nl };
const peopleKeys = Object.keys(en).filter((key) => key.startsWith('people.'));
const placeholdersOf = (text: string): string[] => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('People settings copy (IA main-people-settings §3)', () => {
	it('defines the People keys in English', () => {
		expect(peopleKeys.length).toBeGreaterThan(100);
	});

	it.each(Object.keys(others))('translates every People key in %s', (lang) => {
		const missing = peopleKeys.filter((key) => !others[lang][key]);

		expect(missing).toEqual([]);
	});

	it.each(['ar', 'he', 'fa'])('does not ship English copies in %s', (lang) => {
		const copied = peopleKeys.filter(
			(key) => others[lang][key] === en[key] && /[a-z]{3}/i.test(others[lang][key]),
		);

		expect(copied).toEqual([]);
	});

	it.each(Object.keys(others))('keeps the same placeholders in %s', (lang) => {
		const mismatched = peopleKeys.filter(
			(key) => placeholdersOf(others[lang][key]).join() !== placeholdersOf(en[key]).join(),
		);

		expect(mismatched).toEqual([]);
	});

	it('names the host מארח/ת in Hebrew, never מנהל or מנחה', () => {
		const wrong = peopleKeys.filter((key) => /מנהל|מנחה|מנחים/.test(others.he[key]));

		expect(wrong).toEqual([]);
		expect(others.he['host.peopleDesc']).not.toMatch(/מנחים|חדרי דיון/);
	});
});

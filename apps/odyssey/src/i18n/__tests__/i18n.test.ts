import { describe, expect, it } from 'vitest';
import he from '../locales/he';
import en from '../locales/en';
import ar from '../locales/ar';
import { __setDictionaryForTests, detectLang, setLang, t, type Dictionary } from '../i18n';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Base keys a dictionary answers: plural forms collapse to their stem. */
function baseKeys(dictionary: Dictionary): Set<string> {
	return new Set(Object.keys(dictionary).map((key) => key.replace(PLURAL_SUFFIX, '')));
}

function pluralStems(dictionary: Dictionary): Set<string> {
	return new Set(
		Object.keys(dictionary)
			.filter((key) => PLURAL_SUFFIX.test(key))
			.map((key) => key.replace(PLURAL_SUFFIX, '')),
	);
}

describe('dictionary parity', () => {
	it.each([
		['en', en],
		['ar', ar],
	])('%s answers every Hebrew key', (_name, dictionary) => {
		const missing = [...baseKeys(he)].filter((key) => !baseKeys(dictionary).has(key));
		expect(missing).toEqual([]);
	});

	it.each([
		['en', en],
		['ar', ar],
	])('%s has no keys Hebrew lacks', (_name, dictionary) => {
		const extra = [...baseKeys(dictionary)].filter((key) => !baseKeys(he).has(key));
		expect(extra).toEqual([]);
	});

	it('every plural stem has an _other form in all three languages', () => {
		for (const dictionary of [he, en, ar]) {
			for (const stem of pluralStems(dictionary)) {
				expect(dictionary[`${stem}_other`], stem).toBeDefined();
			}
		}
	});

	it('Arabic plurals carry all six CLDR forms', () => {
		for (const stem of pluralStems(ar)) {
			for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
				expect(ar[`${stem}_${form}`], `${stem}_${form}`).toBeDefined();
			}
		}
	});

	it('placeholders match the Hebrew source', () => {
		const names = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
		for (const dictionary of [en, ar]) {
			for (const [key, text] of Object.entries(dictionary)) {
				const source = he[key] ?? he[`${key.replace(PLURAL_SUFFIX, '')}_other`];
				if (source === undefined) continue;
				expect(names(text), key).toEqual(names(source));
			}
		}
	});
});

describe('t()', () => {
	it('fills params and picks plural forms per language', async () => {
		__setDictionaryForTests('ar', {
			x_zero: 'لا {{count}}',
			x_one: 'واحد',
			x_two: 'اثنان',
			x_few: '{{count}} قليل',
			x_many: '{{count}} كثير',
			x_other: '{{count}} آخر',
		});
		await setLang('ar', false);
		expect(t('x', { count: 0 })).toBe('لا 0');
		expect(t('x', { count: 2 })).toBe('اثنان');
		expect(t('x', { count: 5 })).toBe('5 قليل');
		expect(t('x', { count: 11 })).toBe('11 كثير');
		await setLang('he', false);
	});

	it('falls back to Hebrew, then to the key', async () => {
		__setDictionaryForTests('en', {});
		await setLang('en', false);
		expect(t('app.loading')).toBe(he['app.loading']);
		expect(t('no.such.key')).toBe('no.such.key');
		await setLang('he', false);
	});
});

describe('detectLang', () => {
	it('prefers the link, then the stored choice, then the browser, then Hebrew', () => {
		expect(detectLang('?lang=ar', 'en', ['en-US'])).toBe('ar');
		expect(detectLang('', 'en', ['ar'])).toBe('en');
		expect(detectLang('', null, ['fr-FR', 'ar-EG'])).toBe('ar');
		expect(detectLang('?lang=xx', 'zz', ['fr'])).toBe('he');
	});
});

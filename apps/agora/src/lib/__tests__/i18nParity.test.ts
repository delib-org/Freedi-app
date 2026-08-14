import { describe, it, expect } from 'vitest';
import { translations, type LangCode } from '../i18n';

/**
 * Six languages in one 3,700-line file, edited by hand. They had already
 * drifted: key counts differed across locales, which means some students were
 * being shown a raw dotted key where a sentence should be. Nothing caught it,
 * because nothing was looking.
 *
 * Hebrew is the reference: it is the language the game is authored in and the
 * default (DEFAULT_LANG), so it is the one that cannot be behind.
 */
const REFERENCE: LangCode = 'he';

describe('i18n key parity', () => {
	const reference = Object.keys(translations[REFERENCE]).sort();
	const others = (Object.keys(translations) as LangCode[]).filter((lang) => lang !== REFERENCE);

	it('every locale is present', () => {
		expect(Object.keys(translations).sort()).toEqual(['ar', 'de', 'en', 'es', 'he', 'nl']);
	});

	for (const lang of others) {
		it(`${lang} defines every key Hebrew defines`, () => {
			const keys = new Set(Object.keys(translations[lang]));
			const missing = reference.filter((key) => !keys.has(key));
			expect(missing).toEqual([]);
		});

		it(`${lang} defines no key Hebrew does not`, () => {
			// An extra key is dead weight at best, and usually the fingerprint of a
			// rename applied to one locale and not the source.
			const referenceKeys = new Set(reference);
			const extra = Object.keys(translations[lang]).filter((key) => !referenceKeys.has(key));
			expect(extra).toEqual([]);
		});
	}

	it('no translation is empty', () => {
		const blank: string[] = [];
		for (const [lang, dictionary] of Object.entries(translations)) {
			for (const [key, value] of Object.entries(dictionary)) {
				if (!value.trim()) blank.push(`${lang}:${key}`);
			}
		}
		expect(blank).toEqual([]);
	});
});

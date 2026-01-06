/**
 * Tests for languages - language data management
 */

import { languages, getLanguageData, en, he, ar, de, es, nl } from '../languages';
import { LanguagesEnum, LANGUAGE_NAMES, DEFAULT_LANGUAGE, STORAGE_KEY, COOKIE_KEY } from '../core/constants';

describe('languages', () => {
	describe('languages object', () => {
		it('should contain all LanguagesEnum values', () => {
			Object.values(LanguagesEnum).forEach((lang) => {
				expect(languages[lang]).toBeDefined();
			});
		});

		it('should have English dictionary', () => {
			expect(languages[LanguagesEnum.en]).toBeDefined();
			expect(typeof languages[LanguagesEnum.en]).toBe('object');
		});

		it('should have Hebrew dictionary', () => {
			expect(languages[LanguagesEnum.he]).toBeDefined();
			expect(typeof languages[LanguagesEnum.he]).toBe('object');
		});

		it('should have Arabic dictionary', () => {
			expect(languages[LanguagesEnum.ar]).toBeDefined();
			expect(typeof languages[LanguagesEnum.ar]).toBe('object');
		});

		it('should have German dictionary', () => {
			expect(languages[LanguagesEnum.de]).toBeDefined();
			expect(typeof languages[LanguagesEnum.de]).toBe('object');
		});

		it('should have Spanish dictionary', () => {
			expect(languages[LanguagesEnum.es]).toBeDefined();
			expect(typeof languages[LanguagesEnum.es]).toBe('object');
		});

		it('should have Dutch dictionary', () => {
			expect(languages[LanguagesEnum.nl]).toBeDefined();
			expect(typeof languages[LanguagesEnum.nl]).toBe('object');
		});

		it('should have 6 language dictionaries', () => {
			expect(Object.keys(languages)).toHaveLength(6);
		});
	});

	describe('getLanguageData', () => {
		it('should return English dictionary for English', () => {
			const data = getLanguageData(LanguagesEnum.en);
			expect(data).toBe(languages[LanguagesEnum.en]);
		});

		it('should return Hebrew dictionary for Hebrew', () => {
			const data = getLanguageData(LanguagesEnum.he);
			expect(data).toBe(languages[LanguagesEnum.he]);
		});

		it('should return Arabic dictionary for Arabic', () => {
			const data = getLanguageData(LanguagesEnum.ar);
			expect(data).toBe(languages[LanguagesEnum.ar]);
		});

		it('should return German dictionary for German', () => {
			const data = getLanguageData(LanguagesEnum.de);
			expect(data).toBe(languages[LanguagesEnum.de]);
		});

		it('should return Spanish dictionary for Spanish', () => {
			const data = getLanguageData(LanguagesEnum.es);
			expect(data).toBe(languages[LanguagesEnum.es]);
		});

		it('should return Dutch dictionary for Dutch', () => {
			const data = getLanguageData(LanguagesEnum.nl);
			expect(data).toBe(languages[LanguagesEnum.nl]);
		});

		it('should fallback to English for unsupported language', () => {
			const data = getLanguageData('unsupported' as LanguagesEnum);
			expect(data).toBe(languages[LanguagesEnum.en]);
		});

		it('should fallback to English for undefined', () => {
			const data = getLanguageData(undefined as unknown as LanguagesEnum);
			expect(data).toBe(languages[LanguagesEnum.en]);
		});
	});

	describe('individual language exports', () => {
		it('should export en dictionary', () => {
			expect(en).toBeDefined();
			expect(en).toBe(languages[LanguagesEnum.en]);
		});

		it('should export he dictionary', () => {
			expect(he).toBeDefined();
			expect(he).toBe(languages[LanguagesEnum.he]);
		});

		it('should export ar dictionary', () => {
			expect(ar).toBeDefined();
			expect(ar).toBe(languages[LanguagesEnum.ar]);
		});

		it('should export de dictionary', () => {
			expect(de).toBeDefined();
			expect(de).toBe(languages[LanguagesEnum.de]);
		});

		it('should export es dictionary', () => {
			expect(es).toBeDefined();
			expect(es).toBe(languages[LanguagesEnum.es]);
		});

		it('should export nl dictionary', () => {
			expect(nl).toBeDefined();
			expect(nl).toBe(languages[LanguagesEnum.nl]);
		});
	});

	describe('constants', () => {
		describe('LanguagesEnum', () => {
			it('should have correct values', () => {
				expect(LanguagesEnum.en).toBe('en');
				expect(LanguagesEnum.he).toBe('he');
				expect(LanguagesEnum.ar).toBe('ar');
				expect(LanguagesEnum.de).toBe('de');
				expect(LanguagesEnum.es).toBe('es');
				expect(LanguagesEnum.nl).toBe('nl');
			});

			it('should have 6 languages', () => {
				expect(Object.keys(LanguagesEnum)).toHaveLength(6);
			});
		});

		describe('DEFAULT_LANGUAGE', () => {
			it('should be Hebrew', () => {
				expect(DEFAULT_LANGUAGE).toBe(LanguagesEnum.he);
			});
		});

		describe('LANGUAGE_NAMES', () => {
			it('should have names for all languages', () => {
				expect(LANGUAGE_NAMES[LanguagesEnum.en]).toBe('English');
				expect(LANGUAGE_NAMES[LanguagesEnum.he]).toBe('עברית');
				expect(LANGUAGE_NAMES[LanguagesEnum.ar]).toBe('العربية');
				expect(LANGUAGE_NAMES[LanguagesEnum.de]).toBe('Deutsch');
				expect(LANGUAGE_NAMES[LanguagesEnum.es]).toBe('Español');
				expect(LANGUAGE_NAMES[LanguagesEnum.nl]).toBe('Nederlands');
			});

			it('should have 6 language names', () => {
				expect(Object.keys(LANGUAGE_NAMES)).toHaveLength(6);
			});
		});

		describe('STORAGE_KEY', () => {
			it('should have correct value', () => {
				expect(STORAGE_KEY).toBe('freedi-language');
			});
		});

		describe('COOKIE_KEY', () => {
			it('should have correct value', () => {
				expect(COOKIE_KEY).toBe('freedi-lang');
			});
		});
	});

	describe('dictionary structure', () => {
		it('should have string values in English dictionary', () => {
			Object.values(en).forEach((value) => {
				expect(typeof value).toBe('string');
			});
		});

		it('should have non-empty English dictionary', () => {
			expect(Object.keys(en).length).toBeGreaterThan(0);
		});

		it('all dictionaries should be non-empty', () => {
			Object.values(LanguagesEnum).forEach((lang) => {
				expect(Object.keys(languages[lang]).length).toBeGreaterThan(0);
			});
		});
	});
});

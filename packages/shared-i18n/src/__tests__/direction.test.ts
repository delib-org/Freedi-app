/**
 * Tests for direction - RTL/LTR direction utilities
 */

import { getDirection, getRowDirection, isRTL } from '../core/direction';
import { LanguagesEnum } from '../core/constants';

describe('direction', () => {
	describe('getDirection', () => {
		it('should return rtl for Arabic', () => {
			expect(getDirection(LanguagesEnum.ar)).toBe('rtl');
		});

		it('should return rtl for Hebrew', () => {
			expect(getDirection(LanguagesEnum.he)).toBe('rtl');
		});

		it('should return ltr for English', () => {
			expect(getDirection(LanguagesEnum.en)).toBe('ltr');
		});

		it('should return ltr for German', () => {
			expect(getDirection(LanguagesEnum.de)).toBe('ltr');
		});

		it('should return ltr for Spanish', () => {
			expect(getDirection(LanguagesEnum.es)).toBe('ltr');
		});

		it('should return ltr for Dutch', () => {
			expect(getDirection(LanguagesEnum.nl)).toBe('ltr');
		});

		it('should return correct direction for all LanguagesEnum values', () => {
			const rtlLanguages = [LanguagesEnum.ar, LanguagesEnum.he];
			const ltrLanguages = [
				LanguagesEnum.en,
				LanguagesEnum.de,
				LanguagesEnum.es,
				LanguagesEnum.nl,
			];

			rtlLanguages.forEach((lang) => {
				expect(getDirection(lang)).toBe('rtl');
			});

			ltrLanguages.forEach((lang) => {
				expect(getDirection(lang)).toBe('ltr');
			});
		});
	});

	describe('getRowDirection', () => {
		it('should return row-reverse for Arabic', () => {
			expect(getRowDirection(LanguagesEnum.ar)).toBe('row-reverse');
		});

		it('should return row-reverse for Hebrew', () => {
			expect(getRowDirection(LanguagesEnum.he)).toBe('row-reverse');
		});

		it('should return row for English', () => {
			expect(getRowDirection(LanguagesEnum.en)).toBe('row');
		});

		it('should return row for German', () => {
			expect(getRowDirection(LanguagesEnum.de)).toBe('row');
		});

		it('should return row for Spanish', () => {
			expect(getRowDirection(LanguagesEnum.es)).toBe('row');
		});

		it('should return row for Dutch', () => {
			expect(getRowDirection(LanguagesEnum.nl)).toBe('row');
		});

		it('should return correct row direction for all LanguagesEnum values', () => {
			const rtlLanguages = [LanguagesEnum.ar, LanguagesEnum.he];
			const ltrLanguages = [
				LanguagesEnum.en,
				LanguagesEnum.de,
				LanguagesEnum.es,
				LanguagesEnum.nl,
			];

			rtlLanguages.forEach((lang) => {
				expect(getRowDirection(lang)).toBe('row-reverse');
			});

			ltrLanguages.forEach((lang) => {
				expect(getRowDirection(lang)).toBe('row');
			});
		});
	});

	describe('isRTL', () => {
		it('should return true for Arabic', () => {
			expect(isRTL(LanguagesEnum.ar)).toBe(true);
		});

		it('should return true for Hebrew', () => {
			expect(isRTL(LanguagesEnum.he)).toBe(true);
		});

		it('should return false for English', () => {
			expect(isRTL(LanguagesEnum.en)).toBe(false);
		});

		it('should return false for German', () => {
			expect(isRTL(LanguagesEnum.de)).toBe(false);
		});

		it('should return false for Spanish', () => {
			expect(isRTL(LanguagesEnum.es)).toBe(false);
		});

		it('should return false for Dutch', () => {
			expect(isRTL(LanguagesEnum.nl)).toBe(false);
		});

		it('should be consistent with getDirection', () => {
			Object.values(LanguagesEnum).forEach((lang) => {
				const direction = getDirection(lang);
				const rtl = isRTL(lang);

				if (direction === 'rtl') {
					expect(rtl).toBe(true);
				} else {
					expect(rtl).toBe(false);
				}
			});
		});
	});
});

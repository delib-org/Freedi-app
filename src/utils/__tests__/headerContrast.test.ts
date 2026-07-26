/**
 * Tests for headerContrast — luminance-based header ink selection.
 */

import {
	HEADER_INK_ON_DARK,
	HEADER_INK_ON_LIGHT,
	contrastRatio,
	getHeaderContrastInk,
	parseColorToRgb,
	relativeLuminance,
	resolveCssColor,
} from '../headerContrast';

describe('headerContrast', () => {
	describe('parseColorToRgb', () => {
		it('parses 6-digit hex', () => {
			expect(parseColorToRgb('#ffe16a')).toEqual({ r: 255, g: 225, b: 106 });
		});

		it('parses 3-digit hex', () => {
			expect(parseColorToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
		});

		it('parses 8-digit hex (ignores alpha)', () => {
			expect(parseColorToRgb('#5f88e5cc')).toEqual({ r: 95, g: 136, b: 229 });
		});

		it('parses rgb() and rgba()', () => {
			expect(parseColorToRgb('rgb(255, 225, 106)')).toEqual({ r: 255, g: 225, b: 106 });
			expect(parseColorToRgb('rgba(28, 36, 52, 0.5)')).toEqual({ r: 28, g: 36, b: 52 });
		});

		it('returns null for unparseable values', () => {
			expect(parseColorToRgb('linear-gradient(red, blue)')).toBeNull();
			expect(parseColorToRgb('')).toBeNull();
		});
	});

	describe('relativeLuminance / contrastRatio', () => {
		it('white vs black is 21:1', () => {
			const white = relativeLuminance({ r: 255, g: 255, b: 255 });
			const black = relativeLuminance({ r: 0, g: 0, b: 0 });
			expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
		});

		it('is order-independent', () => {
			const a = relativeLuminance({ r: 255, g: 225, b: 106 });
			const b = relativeLuminance({ r: 42, g: 51, b: 70 });
			expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
		});
	});

	describe('resolveCssColor', () => {
		it('passes literal colors through', () => {
			expect(resolveCssColor('#ffe16a')).toBe('#ffe16a');
		});

		it('uses the var() fallback when the token is undefined (jsdom)', () => {
			expect(resolveCssColor('var(--does-not-exist, #ffe16a)')).toBe('#ffe16a');
		});

		it('returns null for var() without fallback when unresolvable', () => {
			expect(resolveCssColor('var(--does-not-exist)')).toBeNull();
		});
	});

	describe('getHeaderContrastInk', () => {
		it('picks the dark ink on the light option-yellow accent', () => {
			expect(getHeaderContrastInk('#ffe16a')).toBe(HEADER_INK_ON_LIGHT);
			expect(getHeaderContrastInk('var(--header-not-chosen, #ffe16a)')).toBe(HEADER_INK_ON_LIGHT);
		});

		it('keeps the light ink on dark accents', () => {
			expect(getHeaderContrastInk('#10151f')).toBe(HEADER_INK_ON_DARK);
			expect(getHeaderContrastInk('#333333')).toBe(HEADER_INK_ON_DARK);
		});

		it('keeps the light ink on the home blue (white passes 3:1 there)', () => {
			expect(getHeaderContrastInk('var(--header-home, #5f88e5)')).toBe(HEADER_INK_ON_DARK);
		});

		it('flips light mid-tone accents that fail 3:1 with white', () => {
			expect(getHeaderContrastInk('#47b4ef')).toBe(HEADER_INK_ON_LIGHT); // question blue
			expect(getHeaderContrastInk('#b9a1e8')).toBe(HEADER_INK_ON_LIGHT); // group purple
		});

		it('picks the dark ink on near-white accents', () => {
			expect(getHeaderContrastInk('#f8f9fb')).toBe(HEADER_INK_ON_LIGHT);
		});

		it('falls back to the light ink for unresolvable backgrounds', () => {
			expect(getHeaderContrastInk('var(--unknown-token)')).toBe(HEADER_INK_ON_DARK);
			expect(getHeaderContrastInk('not-a-color')).toBe(HEADER_INK_ON_DARK);
		});
	});
});

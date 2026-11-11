import { parseCssColor, rgbaToHex } from '../systemBarColors';

describe('systemBarColors', () => {
	describe('parseCssColor', () => {
		it('parses rgb, rgba and space syntax', () => {
			expect(parseCssColor('rgb(232, 226, 255)')).toEqual({ r: 232, g: 226, b: 255, a: 1 });
			expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
			expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
		});

		it('parses srgb color() and hex', () => {
			expect(parseCssColor('color(srgb 1 0 0.5)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
			expect(parseCssColor('#fbfaf7')).toEqual({ r: 251, g: 250, b: 247, a: 1 });
			expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
		});

		it('returns null for unusable values', () => {
			expect(parseCssColor('')).toBeNull();
			expect(parseCssColor(null)).toBeNull();
			expect(parseCssColor('oklch(0.5 0.1 200)')).toBeNull();
			expect(parseCssColor('#12')).toBeNull();
			expect(parseCssColor('rgb(a, b, c)')).toBeNull();
		});
	});

	it('rgbaToHex pads channels', () => {
		expect(rgbaToHex({ r: 11, g: 15, b: 23, a: 1 })).toBe('#0b0f17');
	});
});

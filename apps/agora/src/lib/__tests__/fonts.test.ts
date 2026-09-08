import { describe, it, expect } from 'vitest';
import { PLAYFUL_FONTS, fontById, fontsFor, fontStack, loadFont } from '../fonts';

describe('the playful faces', () => {
	it('every id is unique and looks like a registry key', () => {
		const ids = PLAYFUL_FONTS.map((font) => font.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
	});

	it('every language the app speaks has faces to choose from', () => {
		for (const lang of ['he', 'en', 'ar', 'es', 'de', 'nl'] as const) {
			expect(fontsFor(lang).length).toBeGreaterThanOrEqual(4);
		}
	});

	it('a Hebrew face is offered to a Hebrew reader, an Arabic one is not', () => {
		expect(fontsFor('he').some((font) => font.id === 'rubik-moonrocks')).toBe(true);
		expect(fontsFor('he').some((font) => font.id === 'lalezar')).toBe(false);
		expect(fontsFor('ar').some((font) => font.id === 'lalezar')).toBe(true);
	});

	it('the stack falls back to the app’s own faces', () => {
		const font = fontById('fredoka');
		expect(font).toBeDefined();
		expect(fontStack(font!)).toMatch(/^'Fredoka', 'Alef', 'Assistant'/);
	});

	it('an unknown id loads nothing and resolves', async () => {
		expect(fontById('comic-sans')).toBeUndefined();
		await expect(loadFont('comic-sans')).resolves.toBeUndefined();
	});
});

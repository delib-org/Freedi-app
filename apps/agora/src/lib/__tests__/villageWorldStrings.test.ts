import { describe, expect, it } from 'vitest';
import { S } from '../../../prototypes/olive-hill/world-strings.js';
import { translations } from '../locales/all';
import {
	VILLAGE_WORLD_KEYS,
	villageWorldI18nKey,
	villageWorldStrings,
} from '../flows/villageWorldStrings';

/**
 * The world (an iframe) keeps a Hebrew fallback for every word it paints; the
 * shell sends the student's language for the same keys. A key on one side
 * only is either a word the world never translates or one the shell sends
 * into nothing.
 */
describe('the 3D world speaks the student’s language', () => {
	it('the shell sends exactly the words the world paints', () => {
		const world = Object.keys(S).filter((key) => key !== 'dir' && key !== 'lang');
		expect([...VILLAGE_WORLD_KEYS].sort()).toEqual(world.sort());
	});

	it('every word exists in every locale', () => {
		const missing: string[] = [];
		for (const [lang, dictionary] of Object.entries(translations)) {
			for (const key of VILLAGE_WORLD_KEYS) {
				if (!dictionary[villageWorldI18nKey(key)]) missing.push(`${lang}:${key}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('resolves to text, keeps the placeholders for the world to fill, and carries the direction', () => {
		const strings = villageWorldStrings();
		expect(strings.note_mine).toBe(translations.he['village.note.mine']);
		expect(strings.board_more).toContain('{{n}}');
		expect(strings.walk_to).toContain('{{place}}');
		expect(strings.dir).toBe('rtl');
		expect(Object.values(strings).some((value) => value.startsWith('village.'))).toBe(false);
	});

	it('the Hebrew speaks to the class in the plural, never "אתה" or "כתוב"', () => {
		for (const key of VILLAGE_WORLD_KEYS) {
			const he = translations.he[villageWorldI18nKey(key)];
			expect(he, key).not.toMatch(/(^|\s)(אתה|כתוב|תרצה|שלך)(\s|[.,?!]|$)/);
		}
	});
});

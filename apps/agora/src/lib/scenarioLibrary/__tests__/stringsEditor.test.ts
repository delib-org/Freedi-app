import { describe, expect, it } from 'vitest';
import { libraryEditorStrings } from '../stringsEditor';
import { saveErrorKey } from '../../scenarioEditor';
import { publishErrorKey } from '../publishFeedback';

const LANGS = Object.keys(libraryEditorStrings) as (keyof typeof libraryEditorStrings)[];

describe('the editor and publish-sheet failure words', () => {
	it('exist in every language, with the same keys', () => {
		const reference = Object.keys(libraryEditorStrings.en).sort();
		for (const lang of LANGS) {
			expect(Object.keys(libraryEditorStrings[lang]).sort()).toEqual(reference);
		}
	});

	it('are never empty', () => {
		for (const lang of LANGS) {
			for (const [key, text] of Object.entries(libraryEditorStrings[lang])) {
				expect(text.trim(), `${lang} ${key}`).not.toBe('');
			}
		}
	});

	it('keep the {mb} placeholder of the size message in every language', () => {
		for (const lang of LANGS) {
			expect(libraryEditorStrings[lang]['editor.file_too_big']).toContain('{mb}');
		}
	});

	it('cover every message the two error mappers can choose', () => {
		const chosen = [
			saveErrorKey({ code: 'permission-denied' }),
			saveErrorKey({ code: 'unauthenticated' }),
			saveErrorKey({ code: 'unavailable' }),
			saveErrorKey({ code: 'not-found' }),
			saveErrorKey(new Error('x')),
			publishErrorKey('functions/failed-precondition'),
			publishErrorKey('functions/invalid-argument'),
			publishErrorKey('functions/not-found'),
		];
		for (const key of chosen) {
			expect(libraryEditorStrings.en[key], key).toBeDefined();
		}
	});
});

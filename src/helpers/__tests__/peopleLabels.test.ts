import * as fs from 'node:fs';
import * as path from 'node:path';
import { Access } from '@freedi/shared-types';
import { ACCESS_COPY_KEYS, SELECTABLE_ACCESS_LEVELS, accessCopyKeys } from '../peopleLabels';

const LANGUAGES_DIR = path.resolve(__dirname, '../../../packages/shared-i18n/src/languages');
const load = (lang: string): Record<string, string> =>
	JSON.parse(fs.readFileSync(path.join(LANGUAGES_DIR, `${lang}.json`), 'utf8'));
const en = load('en');
const he = load('he');

const dictionaries: Record<string, Record<string, string>> = { en, he };

describe('peopleLabels', () => {
	it('gives each selectable access level its own label', () => {
		const labels = SELECTABLE_ACCESS_LEVELS.map((access) => ACCESS_COPY_KEYS[access].label);

		expect(new Set(labels).size).toBe(SELECTABLE_ACCESS_LEVELS.length);
	});

	it('reads the deprecated open level as Open to all', () => {
		expect(accessCopyKeys(Access.open)).toEqual(ACCESS_COPY_KEYS[Access.openToAll]);
	});

	it('falls back to Open to all when the access is missing', () => {
		expect(accessCopyKeys(undefined)).toEqual(ACCESS_COPY_KEYS[Access.openToAll]);
	});

	it.each(Object.keys(dictionaries))('has every label and hint translated in %s', (lang) => {
		Object.values(ACCESS_COPY_KEYS).forEach(({ label, hint }) => {
			expect(dictionaries[lang][label]).toBeTruthy();
			expect(dictionaries[lang][hint]).toBeTruthy();
		});
	});
});

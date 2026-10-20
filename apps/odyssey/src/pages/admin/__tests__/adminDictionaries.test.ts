import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import he from '../i18n/he';
import en from '../i18n/en';
import ar from '../i18n/ar';
import type { Dictionary } from '../../../i18n/i18n';

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

describe('admin dictionary parity', () => {
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

	it('every key is namespaced under admin.', () => {
		for (const dictionary of [he, en, ar]) {
			for (const key of Object.keys(dictionary)) {
				expect(key.startsWith('admin.'), key).toBe(true);
			}
		}
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

describe('admin screens', () => {
	const adminDir = fileURLToPath(new URL('..', import.meta.url));
	const sources = [
		join(adminDir, '..', 'Admin.tsx'),
		...readdirSync(adminDir)
			.filter((name) => name.endsWith('.tsx'))
			.map((name) => join(adminDir, name)),
	];

	it('only ask for keys the Hebrew dictionary has', () => {
		const known = baseKeys(he);
		for (const file of sources) {
			const text = readFileSync(file, 'utf8');
			const asked = [...text.matchAll(/\bt\(\s*'(admin\.[\w.]+)'/g)].map((m) => m[1]);
			const unknown = asked.filter((key) => !known.has(key));
			expect(unknown, file).toEqual([]);
		}
	});
});

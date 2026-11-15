import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import en from '@/lib/locales/en';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import he from '@/lib/locales/he';
import nl from '@/lib/locales/nl';
import bridgeEn from '@/lib/locales/bridge/en';

const LOCALES: Record<string, Record<string, string>> = { en, he, ar, fa, de, es, nl };

function placeholders(text: string): string[] {
	return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

describe('Tables-Class bridge locale keys', () => {
	it('exist in all 7 locales, with the same placeholders', () => {
		const keys = Object.keys(bridgeEn);
		expect(keys.length).toBeGreaterThan(0);
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			for (const key of keys) {
				expect(dictionary[key], `${lang} is missing ${key}`).toBeTruthy();
				expect(placeholders(dictionary[key]), `${lang} placeholders of ${key}`).toEqual(
					placeholders(bridgeEn[key]),
				);
			}
		}
	});

	it('are really translated: only proper words and numbers may repeat the English', () => {
		const mayRepeat = new Set(['opening.name_twice.choice_plain', 'opening.name_twice.choice']);
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			if (lang === 'en') continue;
			for (const key of Object.keys(bridgeEn)) {
				if (mayRepeat.has(key)) continue;
				expect(dictionary[key], `${lang} has English for ${key}`).not.toBe(bridgeEn[key]);
			}
		}
	});

	it('say seats per table, 3 to 20, in every language (no leftover "2 to 8")', () => {
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			expect(dictionary['console.table_size_help'], lang).not.toMatch(/\b8\b|٨|۸/);
		}
		expect(he['console.table_size']).toBe('מקומות בשולחן');
		expect(en['console.table_size_help']).toContain('3 to 20');
	});
});

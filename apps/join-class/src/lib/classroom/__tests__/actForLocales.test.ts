import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import en from '@/lib/locales/en';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import he from '@/lib/locales/he';
import nl from '@/lib/locales/nl';
import actForEn from '@/lib/locales/actFor/en';
import actForHe from '@/lib/locales/actFor/he';

const LOCALES: Record<string, Record<string, string>> = { en, he, ar, fa, de, es, nl };

function placeholders(text: string): string[] {
	return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

describe('proposal limit and act-for locale keys', () => {
	it('exist in all 7 locales, with the same placeholders', () => {
		const keys = Object.keys(actForEn);
		expect(keys.length).toBeGreaterThan(0);
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			for (const key of keys) {
				expect(dictionary[key], `${lang} is missing ${key}`).toBeTruthy();
				expect(placeholders(dictionary[key]), `${lang} placeholders of ${key}`).toEqual(
					placeholders(actForEn[key]),
				);
			}
		}
	});

	it('are really translated: only proper words may repeat the English', () => {
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			if (lang === 'en') continue;
			for (const key of Object.keys(actForEn)) {
				expect(dictionary[key], `${lang} has English for ${key}`).not.toBe(actForEn[key]);
			}
		}
	});

	it('keep the agreed Hebrew', () => {
		expect(actForHe['console.proposal_limit']).toBe('כמה הצעות לכל אחד');
		expect(actForHe['proposal.limit_reached']).toBe('אפשר לשלוח הצעה אחת');
		expect(actForHe['console.propose_for']).toBe('להציע בשם {{name}}');
		expect(actForHe['console.vote_for']).toBe('להצביע בשם {{name}}');
		expect(actForHe['console.entered_by_teacher']).toBe('הוזן על ידי המורה');
	});
});

import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import en from '@/lib/locales/en';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import he from '@/lib/locales/he';
import nl from '@/lib/locales/nl';

const LOCALES: Record<string, Record<string, string>> = { en, he, ar, fa, de, es, nl };
const NAMESPACES = ['turn.', 'question.', 'answer.', 'proposal.', 'rate.', 'voting.', 'summary.'];
const STEPS = ['pick', 'talk', 'write', 'rate'];

function c3Keys(dictionary: Record<string, string>): string[] {
	return Object.keys(dictionary)
		.filter((key) => NAMESPACES.some((ns) => key.startsWith(ns)))
		.sort();
}

function placeholders(text: string): string[] {
	return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

describe('C3 locale keys', () => {
	it('exist in all 7 locales with the same placeholders', () => {
		const keys = c3Keys(en);
		expect(keys.length).toBeGreaterThan(90);
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			for (const key of keys) {
				expect(dictionary[key], `${lang} is missing ${key}`).toBeTruthy();
				expect(placeholders(dictionary[key]), `${lang} placeholders of ${key}`).toEqual(
					placeholders(en[key]),
				);
			}
		}
	});

	it('cover the four table steps used by dynamic keys', () => {
		for (const dictionary of Object.values(LOCALES)) {
			for (const step of STEPS) {
				for (const prefix of ['turn.now_', 'turn.instr_', 'turn.pill_']) {
					expect(dictionary[`${prefix}${step}`]).toBeTruthy();
				}
			}
			for (const camp of ['a', 'center', 'b'])
				expect(dictionary[`summary.side_${camp}`]).toBeTruthy();
			for (const mode of ['each', 'table']) expect(dictionary[`answer.mode_${mode}`]).toBeTruthy();
		}
	});
});

import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import en from '@/lib/locales/en';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import he from '@/lib/locales/he';
import nl from '@/lib/locales/nl';

const LOCALES: Record<string, Record<string, string>> = { en, he, ar, fa, de, es, nl };

/** Keys of IA 23 and 24: the notice line, the language check, the teacher's threads and flags. */
const KEYS = [
	'reply.notice_one',
	'reply.notice_n',
	'reply.new_tag',
	'reply.author_hint',
	'reply.refused',
	'proposal.refused',
	'text.checking',
	'console.hide',
	'console.restore',
	'console.hidden_flag',
	'console.proposal_label',
	'console.reply_label',
	'console.replies_n',
	'console.replies_one',
	'console.flags_n',
	'console.flags_one',
	'console.flag_count',
	'console.flag_count_one',
	'console.flag_show',
	'console.flag_hide_text',
	'console.flag_seen',
	'console.flag_target',
];

function placeholders(text: string): string[] {
	return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

describe('reply notice, language check and flag keys', () => {
	it('exist in all 7 locales with the same placeholders as English', () => {
		for (const [lang, dictionary] of Object.entries(LOCALES)) {
			for (const key of KEYS) {
				expect(dictionary[key], `${lang} ${key}`).toBeTruthy();
				expect(placeholders(dictionary[key]), `${lang} ${key}`).toEqual(placeholders(en[key]));
			}
		}
	});

	it('retires the toast keys', () => {
		for (const dictionary of Object.values(LOCALES)) {
			expect(dictionary['reply.toast']).toBeUndefined();
			expect(dictionary['reply.toast_open']).toBeUndefined();
		}
	});

	it('says the Hebrew wording of the spec', () => {
		expect(he['console.hide']).toBe('הסתרה מהתלמידים');
		expect(he['console.hidden_flag']).toBe('מוסתר מהתלמידים');
		expect(he['reply.notice_one']).toBe('יש תגובה חדשה להצעה שלכם · לקריאה');
	});
});

import { describe, expect, it } from 'vitest';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import en from '@/lib/locales/en';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import he from '@/lib/locales/he';
import nl from '@/lib/locales/nl';
import { detectNotice } from '../noticeLogic';
import type { NoticeSnapshot } from '../noticeLogic';

const BASE: NoticeSnapshot = {
	stepIndex: 5,
	stepKey: 'proposals',
	tableTurn: 3,
	tableStep: 'talk',
	tableAsked: 2,
	tableUsed: 2,
	ballotFrozenAt: 100,
	ballotClosedAt: null,
};

describe('detectNotice', () => {
	it('says nothing on the first look or when nothing changed', () => {
		expect(detectNotice(null, BASE)).toBeNull();
		expect(detectNotice(BASE, { ...BASE })).toBeNull();
	});

	it('says nothing on a forward move', () => {
		expect(detectNotice(BASE, { ...BASE, stepIndex: 6, stepKey: 'vote' })).toBeNull();
	});

	it('names the step the class went back to', () => {
		expect(detectNotice(BASE, { ...BASE, stepIndex: 4, stepKey: 'tableTalk' })).toEqual({
			kind: 'back',
			stepKey: 'tableTalk',
		});
	});

	it('notices the turns starting again, not a table that never had turns', () => {
		const reset = {
			...BASE,
			tableTurn: 1,
			tableStep: 'pick' as const,
			tableAsked: 0,
			tableUsed: 0,
		};
		expect(detectNotice(BASE, reset)).toEqual({ kind: 'turns' });
		expect(detectNotice(reset, reset)).toBeNull();
	});

	it('notices a closed vote that opened again with the same candidates', () => {
		const closed = { ...BASE, ballotClosedAt: 200 };
		expect(detectNotice(closed, { ...BASE })).toEqual({ kind: 'vote' });
		expect(detectNotice(closed, { ...BASE, ballotFrozenAt: 300 })).toBeNull();
	});
});

describe('rewind locale keys', () => {
	const KEYS = [
		'console.back_title',
		'console.back_keep',
		'console.back_yes',
		'console.reset_turns_all',
		'console.reset_turns_table',
		'console.reset_turns_title',
		'console.reset_turns_body',
		'console.reset_vote',
		'console.reset_vote_title',
		'console.reset_vote_body',
		'console.reset_yes',
		'console.hide_vote_closed',
		'lesson.back_line',
		'turn.restarted',
		'vote.restarted',
		'proposal.hidden_mine',
		'vote.choice_removed',
	];
	const placeholders = (text: string): string[] => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

	it('exist in all 7 locales with the same placeholders', () => {
		const locales: Record<string, Record<string, string>> = { en, he, ar, fa, de, es, nl };
		for (const [lang, dictionary] of Object.entries(locales)) {
			for (const key of KEYS) {
				expect(dictionary[key], `${lang} is missing ${key}`).toBeTruthy();
				expect(placeholders(dictionary[key]), `${lang} ${key}`).toEqual(placeholders(en[key]));
			}
		}
	});
});

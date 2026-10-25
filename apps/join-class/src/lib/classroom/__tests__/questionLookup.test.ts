import { describe, expect, it } from 'vitest';
import { questionTextFrom } from '../questionLookup';

const list = [
	{ statementId: 'q1', statement: 'Teacher question' },
	{ statementId: 'q2', statement: 'מי מחליט מה מצחיק?' },
];

describe('questionTextFrom', () => {
	it('is empty when the table has chosen no question', () => {
		expect(questionTextFrom(list, new Map(), undefined)).toBe('');
	});

	it('reads the live list first', () => {
		expect(questionTextFrom(list, new Map([['q1', 'stale']]), 'q1')).toBe('Teacher question');
		expect(questionTextFrom(list, new Map(), 'q2')).toBe('מי מחליט מה מצחיק?');
	});

	it('falls back to the fetched text when the list does not have the id yet', () => {
		expect(questionTextFrom(list, new Map([['q9', 'Own question']]), 'q9')).toBe('Own question');
	});

	it('is null (still loading) when neither source has it', () => {
		expect(questionTextFrom(list, new Map(), 'q9')).toBeNull();
	});
});

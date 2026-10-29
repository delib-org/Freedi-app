import { describe, expect, it } from 'vitest';
import { ASK_FOLD_CHARS, shouldFold } from '../CollapsibleAsk';

describe('shouldFold', () => {
	it('keeps a short question open', () => {
		expect(shouldFold('מה נעשה?')).toBe(false);
		expect(shouldFold('a'.repeat(ASK_FOLD_CHARS))).toBe(false);
	});

	it('folds a long question, Hebrew included', () => {
		expect(shouldFold('א'.repeat(ASK_FOLD_CHARS + 1))).toBe(true);
	});
});

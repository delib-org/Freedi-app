import type { Statement } from '@freedi/shared-types';
import { isHiddenByAutomaticCheck } from '../answerModeration';

function answer(fields: object): Statement {
	return { statementId: 'a', ...fields } as unknown as Statement;
}

describe('isHiddenByAutomaticCheck', () => {
	it('is true for a hidden answer carrying the mark', () => {
		expect(isHiddenByAutomaticCheck(answer({ hide: true, answerModeration: {} }))).toBe(true);
	});

	it('is false once a host restored it, though the mark stays', () => {
		expect(isHiddenByAutomaticCheck(answer({ hide: false, answerModeration: {} }))).toBe(false);
	});

	it('is false for an answer hidden by hand', () => {
		expect(isHiddenByAutomaticCheck(answer({ hide: true }))).toBe(false);
	});
});

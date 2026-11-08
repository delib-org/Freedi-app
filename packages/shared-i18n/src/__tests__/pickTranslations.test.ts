/**
 * Tests for pickTranslations - dictionary subset for client payloads
 */

import { pickTranslations } from '../core/pickTranslations';

describe('pickTranslations', () => {
	const dictionary = { a: 'A', b: 'B', c: 'C' };

	it('keeps only the requested keys', () => {
		expect(pickTranslations(dictionary, ['a', 'c'])).toEqual({ a: 'A', c: 'C' });
	});

	it('skips keys the dictionary does not have', () => {
		expect(pickTranslations(dictionary, ['a', 'missing'])).toEqual({ a: 'A' });
	});

	it('keeps an empty-string translation', () => {
		expect(pickTranslations({ empty: '' }, ['empty'])).toEqual({ empty: '' });
	});

	it('returns an empty dictionary for no keys', () => {
		expect(pickTranslations(dictionary, [])).toEqual({});
	});

	it('does not mutate the source dictionary', () => {
		pickTranslations(dictionary, ['a']);
		expect(dictionary).toEqual({ a: 'A', b: 'B', c: 'C' });
	});
});

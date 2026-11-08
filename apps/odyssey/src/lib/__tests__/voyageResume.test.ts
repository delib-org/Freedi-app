import { describe, expect, it } from 'vitest';
import { isEarlierAnswer, voyageStartIndex } from '../voyageResume';

const islands = [
	{ stances: [{ statementId: 'a1' }, { statementId: 'a2' }] },
	{ stances: [{ statementId: 'b1' }] },
];

describe('voyageStartIndex', () => {
	it('starts at island 1 for a freshly sailed voyage, even with earlier answers', () => {
		expect(voyageStartIndex(islands, { a1: 1, b1: 0 }, true)).toBe(0);
		expect(voyageStartIndex(islands, { a1: 1 }, true)).toBe(0);
	});

	it('resumes at the first unanswered island mid-voyage', () => {
		expect(voyageStartIndex(islands, { a2: 1 }, false)).toBe(1);
		expect(voyageStartIndex(islands, {}, false)).toBe(0);
	});

	it('does not jump to the last island when everything is already answered', () => {
		expect(voyageStartIndex(islands, { a1: 1, b1: -1 }, false)).toBe(0);
	});

	it('handles an empty island list', () => {
		expect(voyageStartIndex([], {}, false)).toBe(0);
	});
});

describe('isEarlierAnswer', () => {
	it('flags answers not given this visit', () => {
		expect(isEarlierAnswer('a1', { a1: 1 }, new Set())).toBe(true);
	});

	it('does not flag answers given this visit or missing ones', () => {
		expect(isEarlierAnswer('a1', { a1: 1 }, new Set(['a1']))).toBe(false);
		expect(isEarlierAnswer('a2', { a1: 1 }, new Set())).toBe(false);
	});
});

import { describe, it, expect } from 'vitest';
import { diffWords, hasRealChange, DiffPart } from '../textDiff';

/** Rebuild each side from the diff — the invariant the renderer relies on */
const rebuild = (parts: DiffPart[], side: 'previous' | 'next'): string =>
	parts
		.filter((part) => part.op === 'same' || part.op === (side === 'previous' ? 'removed' : 'added'))
		.map((part) => part.text)
		.join('');

describe('diffWords', () => {
	it('reports nothing for identical text', () => {
		const parts = diffWords('the king stays', 'the king stays');
		expect(parts).toEqual([{ op: 'same', text: 'the king stays' }]);
	});

	it('marks an appended tail as added', () => {
		const parts = diffWords('the king stays', 'the king stays until 1791');
		expect(parts.filter((p) => p.op === 'added').map((p) => p.text.trim())).toEqual(['until 1791']);
		expect(parts.some((p) => p.op === 'removed')).toBe(false);
	});

	it('marks a deleted phrase as removed', () => {
		const parts = diffWords('the king stays as a symbol', 'the king stays');
		expect(parts.filter((p) => p.op === 'removed').map((p) => p.text.trim())).toEqual([
			'as a symbol',
		]);
	});

	it('shows a replacement as a removal next to an addition', () => {
		const parts = diffWords('taxes rise', 'taxes fall');
		expect(parts.filter((p) => p.op === 'removed').map((p) => p.text.trim())).toEqual(['rise']);
		expect(parts.filter((p) => p.op === 'added').map((p) => p.text.trim())).toEqual(['fall']);
	});

	it('merges consecutive words of the same kind into one run', () => {
		const parts = diffWords('a b c', 'a x y z c');
		const added = parts.filter((p) => p.op === 'added');
		expect(added).toHaveLength(1);
		expect(added[0].text.trim()).toBe('x y z');
	});

	it('is lossless: each side rebuilds exactly', () => {
		const previous = 'האספה תחוקק ותאשר מסים, והמלך יישאר סמל';
		const next = 'האספה הנבחרת תחוקק ותאשר מסים ותקבע לוח זמנים';
		const parts = diffWords(previous, next);
		expect(rebuild(parts, 'previous')).toBe(previous);
		expect(rebuild(parts, 'next')).toBe(next);
	});

	it('handles an empty previous text (the first version)', () => {
		const parts = diffWords('', 'a brand new proposal');
		expect(parts).toEqual([{ op: 'added', text: 'a brand new proposal' }]);
	});

	it('handles everything being deleted', () => {
		const parts = diffWords('gone entirely', '');
		expect(parts).toEqual([{ op: 'removed', text: 'gone entirely' }]);
	});

	it('keeps an inserted word in reading order between untouched runs', () => {
		const parts = diffWords('the assembly votes', 'the elected assembly votes');
		expect(parts.map((p) => p.op)).toEqual(['same', 'added', 'same']);
		expect(parts[1].text.trim()).toBe('elected');
	});
});

describe('hasRealChange', () => {
	it('ignores surrounding whitespace', () => {
		expect(hasRealChange('same text', '  same text  ')).toBe(false);
	});

	it('sees a real edit', () => {
		expect(hasRealChange('same text', 'other text')).toBe(true);
	});
});

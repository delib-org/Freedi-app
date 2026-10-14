import { describe, expect, it } from 'vitest';
import { ballotStatus, followFrozenOrder } from '../ballotView';

describe('ballotStatus', () => {
	const open = { readOnly: false, hasVote: false, saving: false, failed: false };

	it('says idle until the student has a vote', () => {
		expect(ballotStatus(open)).toBe('idle');
	});

	it('says voted once there is a vote and nothing in the air', () => {
		expect(ballotStatus({ ...open, hasVote: true })).toBe('voted');
	});

	it('says saving while a write is in the air, even with a vote shown', () => {
		expect(ballotStatus({ ...open, hasVote: true, saving: true })).toBe('saving');
	});

	it('says failed over saving: the retry is the news', () => {
		expect(ballotStatus({ ...open, hasVote: true, saving: true, failed: true })).toBe('failed');
	});

	it('says closed over everything once the vote is over', () => {
		expect(ballotStatus({ readOnly: true, hasVote: true, saving: true, failed: true })).toBe(
			'closed',
		);
		expect(ballotStatus({ ...open, readOnly: true })).toBe('closed');
	});
});

describe('followFrozenOrder', () => {
	const rows = (ids: string[]) => ids.map((id) => ({ id }));
	const ids = (items: { id: string }[]) => items.map((item) => item.id);

	it('keeps the frozen order whatever the new sort says', () => {
		expect(ids(followFrozenOrder(rows(['c', 'a', 'b']), ['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
	});

	it('puts rows the frozen order never saw after it, in their own order', () => {
		expect(ids(followFrozenOrder(rows(['x', 'b', 'y', 'a']), ['a', 'b']))).toEqual([
			'a',
			'b',
			'x',
			'y',
		]);
	});

	it('drops rows that left the list instead of resurrecting them', () => {
		expect(ids(followFrozenOrder(rows(['b', 'a']), ['gone', 'a', 'b']))).toEqual(['a', 'b']);
	});

	it('is a no-op on an empty freeze', () => {
		expect(ids(followFrozenOrder(rows(['b', 'a']), []))).toEqual(['b', 'a']);
	});
});

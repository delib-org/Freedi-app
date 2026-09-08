import { describe, expect, it } from 'vitest';
import {
	dealRound,
	dealStorageKey,
	extendDeal,
	rankedRest,
	restoreDeal,
	roundRatedCount,
} from '../flows/roundFlow';

const row = (statementId: string, creatorId = `author-${statementId}`) => ({
	statementId,
	creatorId,
	createdAt: 0,
});

const others = [row('a'), row('b'), row('c'), row('d'), row('e')];
const none = new Set<string>();

describe('dealRound', () => {
	it('deals the sample, least-read first, never my own text', () => {
		const deal = dealRound({
			others: [...others, row('mine', 'me')],
			userId: 'me',
			rated: none,
			ratersOf: (id) => ({ a: 3, b: 0, c: 1, d: 0, e: 2 })[id] ?? 0,
			sample: 3,
			stored: null,
		});

		expect(deal).toHaveLength(3);
		expect(deal).not.toContain('mine');
		expect(deal.slice(0, 2).sort()).toEqual(['b', 'd']);
		expect(deal[2]).toBe('c');
	});

	it('keeps a stored deal intact and only fills while it is short', () => {
		const stored = ['e', 'a'];
		const deal = dealRound({
			others,
			userId: 'me',
			rated: none,
			ratersOf: () => 0,
			sample: 3,
			stored,
		});

		expect(deal.slice(0, 2)).toEqual(['e', 'a']);
		expect(deal).toHaveLength(3);
		expect(['b', 'c', 'd']).toContain(deal[2]);

		const full = dealRound({
			others,
			userId: 'me',
			rated: none,
			ratersOf: () => 0,
			sample: 2,
			stored: ['e', 'a'],
		});
		expect(full).toEqual(['e', 'a']);
	});

	it('drops a stored id whose text is gone', () => {
		const deal = dealRound({
			others: [row('a'), row('b')],
			userId: 'me',
			rated: none,
			ratersOf: () => 0,
			sample: 2,
			stored: ['gone', 'a'],
		});

		expect(deal).toEqual(['a', 'b']);
	});

	it('is deterministic for one reader, and prefers what I have not weighed', () => {
		const args = { others, rated: none, ratersOf: () => 0, sample: 3, stored: null };
		const first = dealRound({ ...args, userId: 'reader-1' });
		const again = dealRound({ ...args, userId: 'reader-1' });
		expect(again).toEqual(first);

		// Everything I already weighed drops behind the unweighed rest
		const weighed = dealRound({ ...args, userId: 'reader-1', rated: new Set(first.slice(0, 2)) });
		expect(weighed.slice(0, 3)).not.toContain(first[0]);
		expect(weighed.slice(0, 3)).not.toContain(first[1]);
	});
});

describe('extendDeal and the rest', () => {
	it('appends another sample from the ranked rest, after the deal', () => {
		const rest = rankedRest({ others, userId: 'me', rated: none, ratersOf: () => 0 });
		const deal = rest.slice(0, 2);
		const more = extendDeal(deal, rest, 2);

		expect(more.slice(0, 2)).toEqual(deal);
		expect(more).toHaveLength(4);
		expect(new Set(more).size).toBe(4);
		expect(extendDeal(more, rest, 5)).toHaveLength(5);
	});

	it('counts what I weighed among the dealt', () => {
		expect(roundRatedCount(['a', 'b', 'c'], new Set(['b', 'z']))).toBe(1);
	});
});

describe('storage', () => {
	it('keys per session and item, and tolerates junk', () => {
		expect(dealStorageKey('s', 'story')).toBe('agora_s_story_deal');
		expect(restoreDeal(null)).toBeNull();
		expect(restoreDeal('not json')).toBeNull();
		expect(restoreDeal('{"a":1}')).toBeNull();
		expect(restoreDeal('["a", 2, "b"]')).toEqual(['a', 'b']);
	});
});

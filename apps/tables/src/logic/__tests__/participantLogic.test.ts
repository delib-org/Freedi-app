import { describe, expect, it } from 'vitest';
import {
	clearDraft,
	draftIsFresh,
	draftStorageKey,
	loadDraft,
	parseDraft,
	saveDraft,
	serializeDraft,
} from '../localDraft';
import { participantStage } from '../participantStage';
import {
	isRankingFull,
	keepKnownTopics,
	moveRank,
	rankOf,
	requiredRanks,
	toggleRank,
} from '../ranking';

describe('ranking', () => {
	it('adds a tapped topic at the end and removes it on a second tap', () => {
		expect(toggleRank([], 'a')).toEqual(['a']);
		expect(toggleRank(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleRank(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('never takes more than three', () => {
		const full = toggleRank(toggleRank(toggleRank([], 'a'), 'b'), 'c');

		expect(isRankingFull(full)).toBe(true);
		expect(toggleRank(full, 'd')).toEqual(['a', 'b', 'c']);
		expect(toggleRank(full, 'b')).toEqual(['a', 'c']);
	});

	it('gives the 1/2/3 badge, 0 for unranked', () => {
		expect(rankOf(['a', 'b'], 'b')).toBe(2);
		expect(rankOf(['a', 'b'], 'z')).toBe(0);
	});

	it('reorders and ignores impossible moves', () => {
		expect(moveRank(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
		expect(moveRank(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(moveRank(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});

	it('asks for three ranks, or all topics when there are fewer', () => {
		expect(requiredRanks(5)).toBe(3);
		expect(requiredRanks(2)).toBe(2);
	});

	it('drops topics that no longer exist', () => {
		expect(keepKnownTopics(['a', 'x', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('participantStage', () => {
	const base = { mode: 'ranked', registered: true, hasChosenTable: false } as const;

	it('walks through the statuses', () => {
		expect(participantStage({ ...base, status: 'draft' })).toBe('notOpen');
		expect(participantStage({ ...base, status: 'registrationOpen', registered: false })).toBe(
			'register',
		);
		expect(participantStage({ ...base, status: 'registrationOpen' })).toBe('act');
		expect(participantStage({ ...base, status: 'registrationClosed' })).toBe('waiting');
		expect(participantStage({ ...base, status: 'published' })).toBe('myTable');
		expect(participantStage({ ...base, status: 'ended' })).toBe('ended');
	});

	it('tells a latecomer registration is closed', () => {
		expect(participantStage({ ...base, status: 'registrationClosed', registered: false })).toBe(
			'closedNotRegistered',
		);
	});

	it('direct mode has its seat before any publication', () => {
		expect(
			participantStage({
				status: 'registrationClosed',
				mode: 'direct',
				registered: true,
				hasChosenTable: true,
			}),
		).toBe('myTable');
	});
});

describe('local preference draft', () => {
	function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
		const data = new Map<string, string>();

		return {
			data,
			getItem: (key) => data.get(key) ?? null,
			setItem: (key, value) => {
				data.set(key, value);
			},
		};
	}

	it('keeps the last choices, including "not specified"', () => {
		const storage = memoryStorage();

		saveDraft('s1', 'u1', { ranked: ['a', 'b'], position: null, savedAt: 10 }, storage);

		expect(storage.data.has(draftStorageKey('s1', 'u1'))).toBe(true);
		expect(loadDraft('s1', 'u1', storage)).toEqual({
			ranked: ['a', 'b'],
			position: null,
			savedAt: 10,
		});
		expect(loadDraft('other', 'u1', storage)).toBeNull();
		expect(loadDraft('s1', 'u2', storage)).toBeNull();
	});

	it('keeps a position of 0 apart from not specified', () => {
		expect(parseDraft(serializeDraft({ ranked: [], position: 0, savedAt: 1 }))?.position).toBe(0);
	});

	it('clears a draft and only trusts one newer than the server', () => {
		const storage = { ...memoryStorage(), removeItem: (key: string) => void key };
		const old = { ranked: [], position: null, savedAt: 5 };

		expect(draftIsFresh(old, 5)).toBe(true);
		expect(draftIsFresh(old, 6)).toBe(false);
		clearDraft('s1', 'u1', storage);
	});

	it('ignores malformed storage', () => {
		expect(parseDraft('not json')).toBeNull();
		expect(parseDraft('{"ranked":[1],"position":null}')).toBeNull();
		expect(parseDraft('{"ranked":[],"position":"x"}')).toBeNull();
		expect(parseDraft(null)).toBeNull();
	});
});

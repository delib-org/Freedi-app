import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	acceptsVillageEntry,
	acceptsVillageWrite,
	villageDesk,
	villagePlace,
} from './villageRoute';

describe('the village follows the actual session plan', () => {
	const plan: AgoraStagePlanItem[] = [
		{ itemId: 'welcome', stage: AgoraStage.lobby },
		{ itemId: 'my-story', stage: AgoraStage.question, kind: 'story' },
		{ itemId: 'what-matters', stage: AgoraStage.question, kind: 'needs' },
		{ itemId: 'idea-a', stage: AgoraStage.question, title: 'First question' },
		{ itemId: 'idea-b', stage: AgoraStage.question, title: 'Second question' },
		{ itemId: 'vote', stage: AgoraStage.voting },
	];
	it('maps semantic rounds and decisions to their places', () => {
		expect(plan.map(villagePlace)).toEqual([
			'challenge',
			'story',
			'needs',
			'solution',
			'solution',
			'council',
		]);
	});
	it('sends learning to the library but personal needs to the courtyard', () => {
		for (const stage of [
			AgoraStage.framing,
			AgoraStage.perspectives,
			AgoraStage.needs,
			AgoraStage.positioning,
		]) {
			expect(villagePlace({ itemId: stage, stage })).toBe('library');
		}
		expect(villagePlace({ itemId: 'personal', stage: AgoraStage.question, kind: 'needs' })).toBe(
			'needs',
		);
	});
	it('keeps repeated questions distinct even in the same workshop', () => {
		expect(acceptsVillageEntry({ type: 'agora-village-enter', itemId: 'idea-a' }, plan, 4, 4)).toBe(
			false,
		);
		expect(acceptsVillageEntry({ type: 'agora-village-enter', itemId: 'idea-b' }, plan, 4, 4)).toBe(
			true,
		);
	});
	it('allows rereading an opened item but cannot unlock a future station', () => {
		expect(
			acceptsVillageEntry({ type: 'agora-village-enter', itemId: 'my-story' }, plan, 3, 1),
		).toBe(true);
		expect(acceptsVillageEntry({ type: 'agora-village-enter', itemId: 'vote' }, plan, 3, 5)).toBe(
			false,
		);
	});
	it('works for a short plan without inventing missing stations', () => {
		const short = [plan[0], plan[3], plan[5]];
		expect(short.map(villagePlace)).toEqual(['challenge', 'solution', 'council']);
		expect(acceptsVillageEntry({ type: 'agora-village-enter', itemId: 'vote' }, short, 2, 2)).toBe(
			true,
		);
	});
	it('rejects malformed messages and stale item identities', () => {
		for (const payload of [
			null,
			2,
			{},
			{ type: 'advance', itemId: 'idea-a' },
			{ type: 'agora-village-enter', itemId: 'missing' },
		]) {
			expect(acceptsVillageEntry(payload, plan, 3, 3)).toBe(false);
		}
	});
});

describe('personal writing desks', () => {
	const plan: AgoraStagePlanItem[] = [
		{ itemId: 'story', stage: AgoraStage.question, kind: 'story' },
		{ itemId: 'needs', stage: AgoraStage.question, kind: 'needs' },
		{ itemId: 'idea-a', stage: AgoraStage.deliberation },
		{ itemId: 'idea-b', stage: AgoraStage.deliberation },
		{ itemId: 'vote', stage: AgoraStage.voting },
	];
	it('invites the appropriate kind of writing without adding writing to voting', () => {
		expect(plan.map((item) => villageDesk(item)?.label ?? null)).toEqual([
			'הסיפור שלי',
			'הצרכים שלי',
			'ההצעה שלי',
			'ההצעה שלי',
			null,
		]);
	});
	it('opens only the live paper, keeping repeated proposal rounds distinct', () => {
		expect(acceptsVillageWrite({ type: 'agora-village-write', itemId: 'idea-b' }, plan, 3, 3)).toBe(
			true,
		);
		expect(acceptsVillageWrite({ type: 'agora-village-write', itemId: 'idea-a' }, plan, 3, 3)).toBe(
			false,
		);
		expect(acceptsVillageWrite({ type: 'agora-village-write', itemId: 'idea-a' }, plan, 3, 2)).toBe(
			false,
		);
		expect(acceptsVillageWrite({ type: 'agora-village-write', itemId: 'idea-b' }, plan, 2, 3)).toBe(
			false,
		);
		expect(acceptsVillageWrite({ type: 'agora-village-write', itemId: 'vote' }, plan, 4, 4)).toBe(
			false,
		);
	});
	it('rejects malformed requests and indices outside the plan without throwing', () => {
		for (const payload of [
			null,
			{},
			{ type: 'advance', itemId: 'story' },
			{ type: 'agora-village-write', itemId: undefined },
		]) {
			expect(acceptsVillageWrite(payload, plan, 0, 0)).toBe(false);
			expect(acceptsVillageWrite(payload, plan, 5, 5)).toBe(false);
		}
		expect(villageDesk(undefined)).toBe(null);
		expect(
			acceptsVillageEntry({ type: 'agora-village-enter', itemId: undefined }, plan, 5, 5),
		).toBe(false);
	});
});

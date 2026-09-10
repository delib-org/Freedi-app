import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import { acceptsVillageEntry, villagePlace } from './villageRoute';

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

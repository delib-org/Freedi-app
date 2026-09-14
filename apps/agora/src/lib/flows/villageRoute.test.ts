import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	acceptsVillageEntry,
	acceptsVillageWrite,
	boothItemId,
	villageBooths,
	villageFixedPlaces,
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
	it('gives every question its own booth and sends decisions to the council', () => {
		expect(plan.map(villagePlace)).toEqual([
			'challenge',
			'booth:my-story',
			'booth:what-matters',
			'booth:idea-a',
			'booth:idea-b',
			'council',
		]);
	});
	it('sends learning to the library but every personal question to a booth', () => {
		for (const stage of [
			AgoraStage.framing,
			AgoraStage.perspectives,
			AgoraStage.needs,
			AgoraStage.positioning,
		]) {
			expect(villagePlace({ itemId: stage, stage })).toBe('library');
		}
		expect(villagePlace({ itemId: 'personal', stage: AgoraStage.question, kind: 'needs' })).toBe(
			'booth:personal',
		);
		expect(villagePlace({ itemId: 'square', stage: AgoraStage.deliberation })).toBe('booth:square');
	});
	it('keeps the meeting point and the council open, and marks where the room is', () => {
		expect(villageFixedPlaces(plan, 1)).toEqual({
			library: { open: false, current: false, inPlan: false },
			challenge: { open: true, current: false, inPlan: true },
			council: { open: true, current: false, inPlan: true },
		});
		expect(villageFixedPlaces(plan, 5).council).toEqual({
			open: true,
			current: true,
			inPlan: true,
		});
		expect(villageFixedPlaces(plan, 0).challenge).toEqual({
			open: true,
			current: true,
			inPlan: true,
		});
		const withScenes: AgoraStagePlanItem[] = [
			...plan.slice(0, 1),
			{ itemId: 'framing', stage: AgoraStage.framing },
			...plan.slice(1),
		];
		expect(villageFixedPlaces(withScenes, 0).library).toEqual({
			open: false,
			current: false,
			inPlan: true,
		});
	});
	it('lists the booths of the plan in order, open up to the room and current at the room', () => {
		const booths = villageBooths(plan, 2, (item) => `label:${item.itemId}`);
		expect(booths.map((b) => b.itemId)).toEqual(['my-story', 'what-matters', 'idea-a', 'idea-b']);
		expect(booths.map((b) => b.kind)).toEqual(['story', 'needs', 'open', 'open']);
		expect(booths.map((b) => b.open)).toEqual([true, true, false, false]);
		expect(booths.map((b) => b.current)).toEqual([false, true, false, false]);
		expect(booths[2].label).toBe('First question');
		expect(booths[0].label).toBe('label:my-story');
		expect(boothItemId(booths[0].place)).toBe('my-story');
		expect(boothItemId('council')).toBeNull();
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
		expect(short.map(villagePlace)).toEqual(['challenge', 'booth:idea-a', 'council']);
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

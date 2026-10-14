import { describe, expect, it } from 'vitest';
import type { OdysseyElder, OdysseyGame } from '@freedi/shared-types';
import { opinionDistanceEngine, elderAttitudes } from '../distance';
import {
	activeElders,
	crewByCloseness,
	CREW_SIZE,
	elderIdFromStageId,
	elderStageId,
	pickElderReaction,
	pickIslandRemark,
} from '../elders';
import type { IslandContent } from '../game';

function island(statementId: string, stanceIds: string[]): IslandContent {
	return {
		statementId,
		stances: stanceIds.map((id) => ({ statementId: id })),
	} as unknown as IslandContent;
}

function elder(overrides: Partial<OdysseyElder> = {}): OdysseyElder {
	return {
		elderId: 'bg',
		name: 'דוד בן-גוריון',
		role: 'ראש הממשלה הראשון',
		portraitUrl: null,
		color: '#1f4e79',
		bio: '',
		needs: [],
		values: [],
		positions: { i1: 's1' },
		reactions: { s1: 'agree-line', s2: 'oppose-line' },
		challenges: { i1: 'challenge-line' },
		sortOrder: 1,
		enabled: true,
		...overrides,
	};
}

const islands = [island('i1', ['s1', 's2'])];

describe('elder attitudes and distances', () => {
	it('declares +1 on the declared stance and -1 on siblings', () => {
		expect(elderAttitudes(elder(), islands)).toEqual({ s1: 1, s2: -1 });
	});

	it('distance 0 for a player sailing the elder route, 1 for the opposite', () => {
		const same = opinionDistanceEngine.elderDistances({
			attitudes: { s1: 1, s2: -1 },
			islands,
			elders: [elder()],
		});
		expect(same[0].distance).toBe(0);

		const opposite = opinionDistanceEngine.elderDistances({
			attitudes: { s1: -1, s2: 1 },
			islands,
			elders: [elder()],
		});
		expect(opposite[0].distance).toBe(1);
	});

	it('returns null distance when the elder declared nothing shared', () => {
		const result = opinionDistanceEngine.elderDistances({
			attitudes: { other: 1 },
			islands,
			elders: [elder()],
		});
		expect(result[0].distance).toBeNull();
	});
});

describe('activeElders gating', () => {
	const base = {
		elders: [elder(), elder({ elderId: 'off', enabled: false, sortOrder: 2 })],
	} as unknown as OdysseyGame;

	it('returns enabled elders sorted when no script objects', () => {
		expect(activeElders(base).map((entry) => entry.elderId)).toEqual(['bg']);
	});

	it('returns none when the script switches elders off', () => {
		const game = { ...base, script: { eldersEnabled: false } } as unknown as OdysseyGame;
		expect(activeElders(game)).toEqual([]);
	});

	it('handles a game without elders', () => {
		expect(activeElders({} as OdysseyGame)).toEqual([]);
	});
});

describe('stage ids', () => {
	it('round-trips', () => {
		expect(elderIdFromStageId(elderStageId('bg'))).toBe('bg');
		expect(elderIdFromStageId('likud')).toBeNull();
	});
});

describe('pickElderReaction', () => {
	it('agrees when the player supports the declared stance', () => {
		const remark = pickElderReaction([elder()], islands[0], 's1', 1);
		expect(remark?.agrees).toBe(true);
		expect(remark?.line).toBe('agree-line');
	});

	it('clashes when the player supports a rival stance', () => {
		const remark = pickElderReaction([elder()], islands[0], 's2', 1);
		expect(remark?.agrees).toBe(false);
		expect(remark?.line).toBe('oppose-line');
	});

	it('clashes with an oppose line when the player opposes the declared stance', () => {
		const remark = pickElderReaction([elder()], islands[0], 's1', -1);
		expect(remark?.agrees).toBe(false);
		expect(remark?.line).toBe('oppose-line');
	});

	it('returns null when no elder declared on the island', () => {
		expect(pickElderReaction([elder({ positions: {} })], islands[0], 's1', 1)).toBeNull();
	});
});

describe('pickIslandRemark', () => {
	it('prefers a marked stance an elder declared', () => {
		const remark = pickIslandRemark([elder()], islands[0], { s2: 0.5, s1: 1 });
		expect(remark?.agrees).toBe(true);
	});

	it('returns null when nothing was marked', () => {
		expect(pickIslandRemark([elder()], islands[0], {})).toBeNull();
	});
});

describe('crewByCloseness', () => {
	const crew = ['bg', 'begin', 'golda', 'rabin', 'jabotinsky', 'herzl', 'katznelson'].map(
		(elderId, index) => elder({ elderId, sortOrder: index + 1 }),
	);

	it('nobody sails before the player has said anything', () => {
		// Every distance is null until the first island is answered.
		expect(crewByCloseness(crew, {})).toEqual([]);
		expect(crewByCloseness(crew, { bg: null, begin: null })).toEqual([]);
	});

	it('takes the closest elders, nearest first', () => {
		const ids = crewByCloseness(crew, { bg: 0.8, begin: 0.1, golda: 0.4, rabin: null }).map(
			(entry) => entry.elderId,
		);
		expect(ids).toEqual(['begin', 'golda', 'bg']);
	});

	it('sails more than three when there are more than three to sail', () => {
		const distances = Object.fromEntries(crew.map((entry, index) => [entry.elderId, index / 10]));
		expect(CREW_SIZE).toBeGreaterThan(3);
		expect(crewByCloseness(crew, distances)).toHaveLength(CREW_SIZE);
		expect(crewByCloseness(crew, distances, 100)).toHaveLength(crew.length);
	});

	it('keeps the organizer order on a tie', () => {
		const ids = crewByCloseness(crew, { golda: 0.2, bg: 0.2, begin: 0.2 }).map(
			(entry) => entry.elderId,
		);
		expect(ids).toEqual(['bg', 'begin', 'golda']);
	});

	it('treats a distance of 0 as the closest, not as missing', () => {
		expect(crewByCloseness(crew, { begin: 0, bg: 0.5 }).map((entry) => entry.elderId)).toEqual([
			'begin',
			'bg',
		]);
	});
});

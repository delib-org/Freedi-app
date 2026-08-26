import { describe, expect, it } from 'vitest';
import type { OdysseyElder, OdysseyGame } from '@freedi/shared-types';
import { opinionDistanceEngine, elderAttitudes } from '../distance';
import {
	activeElders,
	invitedElders,
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

describe('invitedElders', () => {
	const game = {
		elders: [
			{ elderId: 'bg', enabled: true, sortOrder: 1 },
			{ elderId: 'begin', enabled: true, sortOrder: 2 },
			{ elderId: 'golda', enabled: true, sortOrder: 3 },
		],
	} as unknown as OdysseyGame;

	it('sails everyone when the player was never asked', () => {
		// Journeys begun before the choosing screen existed. `undefined` has to
		// keep behaving exactly as it did, or a returning player suddenly loses
		// the company they already had.
		expect(invitedElders(game, undefined).map((elder) => elder.elderId)).toEqual([
			'bg',
			'begin',
			'golda',
		]);
	});

	it('sails no one when the player was asked and chose no one', () => {
		// The distinction that matters: [] is an answer, not a missing answer.
		expect(invitedElders(game, [])).toEqual([]);
	});

	it('sails only the invited', () => {
		expect(invitedElders(game, ['begin']).map((elder) => elder.elderId)).toEqual(['begin']);
	});

	it('ignores an invitation to an elder who is switched off', () => {
		const withDisabled = {
			elders: [{ elderId: 'bg', enabled: false, sortOrder: 1 }],
		} as unknown as OdysseyGame;
		expect(invitedElders(withDisabled, ['bg'])).toEqual([]);
	});

	it('sails no one when the organizer switched the elders off entirely', () => {
		const noElders = { ...game, script: { eldersEnabled: false } } as unknown as OdysseyGame;
		expect(invitedElders(noElders, ['bg'])).toEqual([]);
	});
});

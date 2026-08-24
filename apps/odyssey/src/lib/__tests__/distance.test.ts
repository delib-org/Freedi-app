import { describe, expect, it } from 'vitest';
import type { Evaluation, OdysseyParty } from '@freedi/shared-types';
import type { IslandContent } from '../game';
import {
	MIN_SHARED_STANCES,
	opinionDistance,
	opinionDistanceEngine,
	partyAttitudes,
	participantProfiles,
	type AttitudeMap,
} from '../distance';

/**
 * Fixtures follow the toy example in
 * apps/agora/docs/opinion-distance-and-map.md §3: 4 users, 2 statements
 * about taxes (s1, s2), 2 about climate (s3, s4).
 */
const dana: AttitudeMap = { s1: 1, s2: 1, s3: 1, s4: 1 };
const eli: AttitudeMap = { s1: 1, s2: 1, s3: -1, s4: -1 };
const noa: AttitudeMap = { s1: -1, s2: -1, s3: 1, s4: 1 };
const omer: AttitudeMap = { s1: -1, s2: -1, s3: -1, s4: -1 };

function makeEvaluation(uid: string, stanceId: string, value: number): Evaluation {
	return {
		evaluationId: `${uid}--${stanceId}`,
		parentId: 'island-1',
		statementId: stanceId,
		evaluatorId: uid,
		evaluation: value,
		updatedAt: 1,
	};
}

function makeIsland(statementId: string, stanceIds: string[]): IslandContent {
	return {
		statementId,
		title: statementId,
		issue: '',
		shortExplain: '',
		opening: '',
		depthQuestion: '',
		imageUrl: null,
		posX: 0,
		posY: 0,
		sortOrder: 0,
		enabled: true,
		statement: { statementId } as IslandContent['statement'],
		stances: stanceIds.map((stanceId) => ({ statementId: stanceId }) as IslandContent['statement']),
	};
}

function makeParty(partyId: string, positions: Record<string, string>): OdysseyParty {
	return {
		partyId,
		name: partyId,
		color: '#123456',
		imageUrl: null,
		description: '',
		positions,
		sortOrder: 0,
		enabled: true,
	};
}

function makePartyWithAttitudes(
	partyId: string,
	attitudes: Record<string, number>,
	positions?: Record<string, string>,
): OdysseyParty {
	return { ...makeParty(partyId, positions ?? {}), attitudes };
}

describe('opinionDistance', () => {
	it('reproduces the doc toy example (normalized to 0..1)', () => {
		// Raw doc distances: Dana–Eli = 1, Dana–Omer = 2 → normalized 0.5, 1.
		expect(opinionDistance(dana, eli, 1).distance).toBe(0.5);
		expect(opinionDistance(dana, noa, 1).distance).toBe(0.5);
		expect(opinionDistance(dana, omer, 1).distance).toBe(1);
		expect(opinionDistance(eli, noa, 1).distance).toBe(1);
		expect(opinionDistance(eli, omer, 1).distance).toBe(0.5);
		expect(opinionDistance(noa, omer, 1).distance).toBe(0.5);
	});

	it('is 0 for identical routes and counts shared stances', () => {
		const result = opinionDistance(dana, { ...dana }, 1);
		expect(result.distance).toBe(0);
		expect(result.sharedStances).toBe(4);
	});

	it('averages only over shared stances', () => {
		// Only s1 shared: |1 − (−1)| / 2 = 1.
		expect(opinionDistance({ s1: 1, s9: 1 }, { s1: -1, s8: 1 }, 1)).toEqual({
			distance: 1,
			sharedStances: 1,
		});
	});

	it('applies the minimum-overlap rule (doc §1)', () => {
		// 4 shared stances < MIN_SHARED_STANCES → noise → null.
		expect(MIN_SHARED_STANCES).toBe(5);
		const result = opinionDistance(dana, omer);
		expect(result.distance).toBeNull();
		expect(result.sharedStances).toBe(4);
	});
});

describe('partyAttitudes', () => {
	it('LEGACY: supports the declared stance and opposes its island siblings', () => {
		const islands = [makeIsland('island-1', ['s1', 's2', 's3'])];
		const party = makeParty('p1', { 'island-1': 's2' });
		expect(partyAttitudes(party, islands)).toEqual({ s1: -1, s2: 1, s3: -1 });
	});

	it('skips islands without any data', () => {
		const islands = [makeIsland('island-1', ['s1', 's2']), makeIsland('island-2', ['s3', 's4'])];
		const party = makeParty('p1', { 'island-1': 's1' });
		expect(partyAttitudes(party, islands)).toEqual({ s1: 1, s2: -1 });
	});

	it('passes continuous scores through verbatim', () => {
		const islands = [makeIsland('island-1', ['s1', 's2', 's3'])];
		const party = makePartyWithAttitudes('p1', { s1: 0.5, s2: -0.5, s3: 0 });
		expect(partyAttitudes(party, islands)).toEqual({ s1: 0.5, s2: -0.5, s3: 0 });
	});

	it('mixes continuous and legacy islands, continuous winning per stance', () => {
		const islands = [makeIsland('island-1', ['s1', 's2']), makeIsland('island-2', ['s3', 's4'])];
		const party = makePartyWithAttitudes('p1', { s1: 0.5, s2: -0.5 }, { 'island-2': 's3' });
		expect(partyAttitudes(party, islands)).toEqual({ s1: 0.5, s2: -0.5, s3: 1, s4: -1 });
	});
});

describe('opinionDistanceEngine.partyDistances', () => {
	const islands = [makeIsland('island-1', ['s1', 's2']), makeIsland('island-2', ['s3', 's4'])];

	it('gives distance 0 when the player fully sails the party route', () => {
		const party = makeParty('p1', { 'island-1': 's1', 'island-2': 's3' });
		const [result] = opinionDistanceEngine.partyDistances({
			attitudes: { s1: 1, s2: -1, s3: 1, s4: -1 },
			islands,
			parties: [party],
		});
		expect(result).toEqual({ partyId: 'p1', distance: 0, sharedIslands: 2 });
	});

	it('gives distance 1 for the exactly opposite route', () => {
		const party = makeParty('p1', { 'island-1': 's1', 'island-2': 's3' });
		const [result] = opinionDistanceEngine.partyDistances({
			attitudes: { s1: -1, s2: 1, s3: -1, s4: 1 },
			islands,
			parties: [party],
		});
		expect(result.distance).toBe(1);
	});

	it('returns null when the player and party share no island', () => {
		const party = makeParty('p1', { 'island-2': 's3' });
		const [result] = opinionDistanceEngine.partyDistances({
			attitudes: { s1: 1 },
			islands,
			parties: [party],
		});
		expect(result).toEqual({ partyId: 'p1', distance: null, sharedIslands: 0 });
	});

	it('measures fractional distance to a continuously-scored party', () => {
		// |1−0.5| + |−1−(−0.5)| over 2 shared stances → (0.5+0.5)/2/2 = 0.25.
		const party = makePartyWithAttitudes('p1', { s1: 0.5, s2: -0.5 });
		const [result] = opinionDistanceEngine.partyDistances({
			attitudes: { s1: 1, s2: -1 },
			islands,
			parties: [party],
		});
		expect(result).toEqual({ partyId: 'p1', distance: 0.25, sharedIslands: 1 });
	});

	it('gates islands by scored stances when the party has no legacy positions', () => {
		const party = makePartyWithAttitudes('p1', { s3: 1, s4: -1 });
		const [result] = opinionDistanceEngine.partyDistances({
			attitudes: { s1: 1, s2: -1 },
			islands,
			parties: [party],
		});
		expect(result).toEqual({ partyId: 'p1', distance: null, sharedIslands: 0 });
	});
});

describe('opinionDistanceEngine.participantDistances', () => {
	const users: Array<[string, AttitudeMap]> = [
		['dana', dana],
		['eli', eli],
		['omer', omer],
	];
	// 5 stances so the pairs clear the min-overlap rule.
	const evaluations = users.flatMap(([uid, attitudes]) => [
		...Object.entries(attitudes).map(([stanceId, value]) => makeEvaluation(uid, stanceId, value)),
		makeEvaluation(uid, 's5', uid === 'omer' ? -1 : 1),
	]);

	it('computes normalized distances to every other participant', () => {
		const results = opinionDistanceEngine.participantDistances({ uid: 'dana', evaluations });
		const byUser = Object.fromEntries(results.map((entry) => [entry.userId, entry]));

		expect(results).toHaveLength(2);
		// Eli: diffs (0,0,2,2,0)/5 = 0.8 raw → 0.4 normalized.
		expect(byUser.eli).toMatchObject({ distance: 0.4, sharedStances: 5 });
		// Omer: diffs (2,2,2,2,2)/5 = 2 raw → 1 normalized.
		expect(byUser.omer).toMatchObject({ distance: 1, sharedStances: 5 });
	});

	it('groups evaluations into profiles keyed by evaluator', () => {
		const profiles = participantProfiles(evaluations);
		expect([...profiles.keys()].sort()).toEqual(['dana', 'eli', 'omer']);
		expect(profiles.get('dana')?.attitudes.s5).toBe(1);
	});
});

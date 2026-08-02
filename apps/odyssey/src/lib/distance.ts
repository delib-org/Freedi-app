import type { Evaluation, OdysseyParty } from '@freedi/shared-types';
import type { IslandContent } from './game';

/**
 * ==========================  DISTANCE ENGINE  ==========================
 * The real opinion-distance method, implementing §1 of
 * `apps/agora/docs/opinion-distance-and-map.md`:
 *
 *   d(a, b) = mean( |eₐ(s) − e_b(s)| )   over stances BOTH sides evaluated
 *
 * The raw metric lives in [0, 2] (0 = identical evaluations, 2 = always
 * opposed). The engine exposes it normalized to [0, 1] so screens keep the
 * "0 = sails exactly your route, 1 = opposite route" contract.
 *
 * Minimum-overlap rule (doc §1): with only 1–2 shared stances the number
 * is noise, so the distance stays null until enough stances are shared.
 *
 * Parties participate as VIRTUAL USERS: a party "evaluates" the stance it
 * declared on an island with +1 (support) and that island's other stances
 * with −1 (oppose) — its route through the same sea. The same metric then
 * applies to player↔party exactly as to player↔player.
 * =======================================================================
 */

/** stance statementId → evaluation value (-1..1) */
export type AttitudeMap = Record<string, number>;

/** Doc §1: below ~5 shared stances a pair distance is noise. */
export const MIN_SHARED_STANCES = 5;

/** A party declares a full route, and the sea must react from the first
 *  island — so one shared island is enough to place its ship. */
export const MIN_SHARED_PARTY_ISLANDS = 1;

export interface PartyDistance {
	partyId: string;
	/** 0 = sails exactly your route, 1 = opposite route, null = no data */
	distance: number | null;
	sharedIslands: number;
}

export interface ParticipantDistance {
	userId: string;
	displayName: string;
	distance: number | null;
	sharedStances: number;
}

export interface DistanceEngine {
	partyDistances(input: {
		attitudes: AttitudeMap;
		islands: IslandContent[];
		parties: OdysseyParty[];
	}): PartyDistance[];
	participantDistances(input: { uid: string; evaluations: Evaluation[] }): ParticipantDistance[];
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export interface OpinionDistanceResult {
	/** Normalized 0..1 (doc metric / 2); null under the min-overlap rule. */
	distance: number | null;
	sharedStances: number;
}

/** The doc §1 metric between two attitude maps. */
export function opinionDistance(
	a: AttitudeMap,
	b: AttitudeMap,
	minShared: number = MIN_SHARED_STANCES,
): OpinionDistanceResult {
	let sum = 0;
	let shared = 0;
	for (const [stanceId, aValue] of Object.entries(a)) {
		const bValue = b[stanceId];
		if (bValue === undefined) continue;
		sum += Math.abs(aValue - bValue);
		shared += 1;
	}

	return {
		distance: shared >= Math.max(1, minShared) ? round2(sum / shared / 2) : null,
		sharedStances: shared,
	};
}

/** A party's route as a virtual attitude map: +1 on its declared stance per
 *  island, −1 on that island's other stances. */
export function partyAttitudes(party: OdysseyParty, islands: IslandContent[]): AttitudeMap {
	const attitudes: AttitudeMap = {};
	for (const island of islands) {
		const declaredStanceId = party.positions[island.statementId];
		if (!declaredStanceId) continue;
		for (const stance of island.stances) {
			attitudes[stance.statementId] = -1;
		}
		attitudes[declaredStanceId] = 1;
	}

	return attitudes;
}

/** Everyone's evaluations grouped into per-user attitude maps. */
export interface ParticipantProfile {
	userId: string;
	displayName: string;
	attitudes: AttitudeMap;
}

export function participantProfiles(evaluations: Evaluation[]): Map<string, ParticipantProfile> {
	const profiles = new Map<string, ParticipantProfile>();
	for (const evaluation of evaluations) {
		const profile = profiles.get(evaluation.evaluatorId) ?? {
			userId: evaluation.evaluatorId,
			displayName: evaluation.evaluator?.displayName?.split(' ')[0] ?? 'מפליג/ה',
			attitudes: {},
		};
		profile.attitudes[evaluation.statementId] = evaluation.evaluation;
		profiles.set(evaluation.evaluatorId, profile);
	}

	return profiles;
}

function opinionPartyDistances(input: {
	attitudes: AttitudeMap;
	islands: IslandContent[];
	parties: OdysseyParty[];
}): PartyDistance[] {
	const { attitudes, islands, parties } = input;

	return parties.map((party) => {
		const virtual = partyAttitudes(party, islands);
		let sum = 0;
		let shared = 0;
		let sharedIslands = 0;
		for (const island of islands) {
			if (!party.positions[island.statementId]) continue;
			let islandShared = 0;
			for (const stance of island.stances) {
				const mine = attitudes[stance.statementId];
				const theirs = virtual[stance.statementId];
				if (mine === undefined || theirs === undefined) continue;
				sum += Math.abs(mine - theirs);
				islandShared += 1;
			}
			if (islandShared > 0) sharedIslands += 1;
			shared += islandShared;
		}

		return {
			partyId: party.partyId,
			distance:
				sharedIslands >= MIN_SHARED_PARTY_ISLANDS && shared > 0 ? round2(sum / shared / 2) : null,
			sharedIslands,
		};
	});
}

function opinionParticipantDistances(input: {
	uid: string;
	evaluations: Evaluation[];
}): ParticipantDistance[] {
	const { uid, evaluations } = input;
	const profiles = participantProfiles(evaluations);
	const mine = profiles.get(uid)?.attitudes ?? {};

	return [...profiles.values()]
		.filter((profile) => profile.userId !== uid)
		.map((profile) => {
			const { distance, sharedStances } = opinionDistance(mine, profile.attitudes);

			return {
				userId: profile.userId,
				displayName: profile.displayName,
				distance,
				sharedStances,
			};
		});
}

export const opinionDistanceEngine: DistanceEngine = {
	partyDistances: opinionPartyDistances,
	participantDistances: opinionParticipantDistances,
};

/** The engine the app uses. */
export const distanceEngine: DistanceEngine = opinionDistanceEngine;

import type { AttitudeMap, Evaluation, OdysseyElder, OdysseyParty } from '@freedi/shared-types';
import { opinionDistance } from '@freedi/shared-types';
import type { IslandContent } from './game';

/**
 * ==========================  DISTANCE ENGINE  ==========================
 * The sea's reaction: how far each party and each fellow player sails from
 * your route.
 *
 * The metric itself — `opinionDistance`, doc §1 of
 * `apps/agora/docs/opinion-distance-and-map.md` — now lives in shared-types,
 * because a civic Agora event scores itself on the same arithmetic and two
 * copies could disagree about the same room. This module keeps what is
 * genuinely Odyssey's: parties as virtual users, and the two engine shapes
 * the screens consume.
 *
 * Parties participate as VIRTUAL USERS: a party "evaluates" the stance it
 * declared on an island with +1 (support) and that island's other stances
 * with −1 (oppose) — its route through the same sea. The same metric then
 * applies to player↔party exactly as to player↔player.
 * =======================================================================
 */

export type { AttitudeMap, OpinionDistanceResult } from '@freedi/shared-types';
export { MIN_SHARED_STANCES, opinionDistance } from '@freedi/shared-types';

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

export interface ElderDistance {
	elderId: string;
	distance: number | null;
	sharedIslands: number;
}

export interface DistanceEngine {
	partyDistances(input: {
		attitudes: AttitudeMap;
		islands: IslandContent[];
		parties: OdysseyParty[];
	}): PartyDistance[];
	elderDistances(input: {
		attitudes: AttitudeMap;
		islands: IslandContent[];
		elders: OdysseyElder[];
	}): ElderDistance[];
	participantDistances(input: { uid: string; evaluations: Evaluation[] }): ParticipantDistance[];
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Anything that declares one stance per island — parties and elders share
 *  this shape, so the same virtual-user arithmetic covers both. */
export interface RouteHolder {
	/** island statementId → declared stance statementId */
	positions: Record<string, string>;
}

/** A route holder's declared course as a virtual attitude map: +1 on its
 *  declared stance per island, −1 on that island's other stances. */
export function routeAttitudes(holder: RouteHolder, islands: IslandContent[]): AttitudeMap {
	const attitudes: AttitudeMap = {};
	for (const island of islands) {
		const declaredStanceId = holder.positions[island.statementId];
		if (!declaredStanceId) continue;
		for (const stance of island.stances) {
			attitudes[stance.statementId] = -1;
		}
		attitudes[declaredStanceId] = 1;
	}

	return attitudes;
}

/** A party's route as a virtual attitude map (kept for existing callers). */
export function partyAttitudes(party: OdysseyParty, islands: IslandContent[]): AttitudeMap {
	return routeAttitudes(party, islands);
}

/** An elder's declared course as a virtual attitude map. */
export function elderAttitudes(elder: OdysseyElder, islands: IslandContent[]): AttitudeMap {
	return routeAttitudes(elder, islands);
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

/** One route holder's distance from the player, the party arithmetic. */
function routeDistance(
	attitudes: AttitudeMap,
	islands: IslandContent[],
	holder: RouteHolder,
): { distance: number | null; sharedIslands: number } {
	const virtual = routeAttitudes(holder, islands);
	let sum = 0;
	let shared = 0;
	let sharedIslands = 0;
	for (const island of islands) {
		if (!holder.positions[island.statementId]) continue;
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
		distance:
			sharedIslands >= MIN_SHARED_PARTY_ISLANDS && shared > 0 ? round2(sum / shared / 2) : null,
		sharedIslands,
	};
}

function opinionPartyDistances(input: {
	attitudes: AttitudeMap;
	islands: IslandContent[];
	parties: OdysseyParty[];
}): PartyDistance[] {
	const { attitudes, islands, parties } = input;

	return parties.map((party) => ({
		partyId: party.partyId,
		...routeDistance(attitudes, islands, party),
	}));
}

function opinionElderDistances(input: {
	attitudes: AttitudeMap;
	islands: IslandContent[];
	elders: OdysseyElder[];
}): ElderDistance[] {
	const { attitudes, islands, elders } = input;

	return elders.map((elder) => ({
		elderId: elder.elderId,
		...routeDistance(attitudes, islands, elder),
	}));
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
	elderDistances: opinionElderDistances,
	participantDistances: opinionParticipantDistances,
};

/** The engine the app uses. */
export const distanceEngine: DistanceEngine = opinionDistanceEngine;

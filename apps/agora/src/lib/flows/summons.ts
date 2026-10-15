import { calledItemIndex, villagePlace } from './villageRoute';
import type { AgoraStagePlanItem } from '@freedi/shared-types';

/**
 * The teacher's call as a standing order.
 *
 * A call used to be treated as news: a student acted on it only if it was
 * under two minutes old on first sight, and only in the 3D village. That
 * dropped the very students a call is for — a phone that locked while the
 * teacher spoke, a tab in the background, a late joiner — and in the flat
 * view it never moved anyone at all (a toast the student had to tap).
 *
 * A summons stands until something supersedes it: a newer call, or the
 * teacher opening a new station after it (the room's current `openedAt` is
 * server time; the call stamp is the teacher's clock, floored above that
 * `openedAt` by `nextCallStamp`, so the comparison has one direction).
 * Each device remembers the newest stamp it honoured, so a reload does not
 * walk twice and a call never seen is honoured on resume. No wall clock,
 * no "first render" heuristics.
 *
 * Pure — the controller persists the stamp and runs the walk.
 */
export interface VillageCall {
	place: string;
	at: number;
}

export interface SummonsInput {
	call: VillageCall | undefined;
	/** `stageState[current].openedAt` — when the room reached its current station */
	currentOpenedAt: number | undefined;
	/** The newest call stamp this device already acted on, or undefined */
	handledAt: number | undefined;
}

export type Summons = { place: string; at: number; kind: 'walk' } | { at: number; kind: 'retire' };

/**
 * What this device owes the call on the session doc: a walk, a quiet
 * retirement (an advance after it already took the class elsewhere — the
 * stamp is marked handled so it is not re-read every render), or nothing.
 */
export function resolveSummons(input: SummonsInput): Summons | null {
	const { call, currentOpenedAt, handledAt } = input;
	if (!call) return null;
	if (handledAt !== undefined && call.at <= handledAt) return null;
	if (currentOpenedAt !== undefined && currentOpenedAt > call.at) {
		return { at: call.at, kind: 'retire' };
	}

	return { place: call.place, at: call.at, kind: 'walk' };
}

/**
 * The stamp the teacher writes: their clock, but never below the server
 * time the room reached its station — a laptop a minute slow must not
 * write a call that every phone reads as older than the station it stands on.
 */
export function nextCallStamp(now: number, currentOpenedAt: number | undefined): number {
	return Math.max(now, (currentOpenedAt ?? 0) + 1);
}

/** `current` resolved to the room's own place; any other place as written */
export function callTargetPlace(
	place: string,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): string {
	if (place !== 'current') return place;
	const room = plan[currentIndex];

	return room ? villagePlace(room) : place;
}

/** The opened plan item a call lands on, or -1 when the place holds none */
export function callTargetIndex(
	place: string,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): number {
	return calledItemIndex(callTargetPlace(place, plan, currentIndex), plan, currentIndex);
}

/** A student mid-sentence gets this long to finish before the walk; one extension of the same length */
export const TYPING_GRACE_MS = 25000;

export interface Whereabouts {
	place: string;
	at: number;
	callAt?: number;
}

export interface ArrivalStatus {
	place: string;
	arrived: number;
	total: number;
	/** Pseudonyms of those not there yet, in roster order */
	waiting: string[];
}

/**
 * Who has reached a place, from the whereabouts each phone reports. A
 * student standing somewhere else, or one whose phone never reported, is
 * "not there yet" — the same word for both, because the teacher's next
 * move is the same: look up, or call again.
 */
export function arrivalStatus(
	participants: ReadonlyArray<{ anonName: string; whereabouts?: Whereabouts }>,
	place: string,
): ArrivalStatus {
	const waiting: string[] = [];
	let arrived = 0;
	for (const participant of participants) {
		if (participant.whereabouts?.place === place) arrived++;
		else waiting.push(participant.anonName);
	}

	return { place, arrived, total: participants.length, waiting };
}

/**
 * The place a teacher's console reads arrivals for: a standing call's
 * target, or — once the call is over or there was none — the room's own
 * station, so the list is never empty of meaning.
 */
export function arrivalPlace(
	call: VillageCall | undefined,
	currentOpenedAt: number | undefined,
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): { place: string; fromCall: boolean } | null {
	const room = plan[currentIndex];
	if (!room) return null;
	const standing = call && !(currentOpenedAt !== undefined && currentOpenedAt > call.at);
	if (standing) return { place: callTargetPlace(call.place, plan, currentIndex), fromCall: true };

	return { place: villagePlace(room), fromCall: false };
}

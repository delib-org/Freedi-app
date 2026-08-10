/**
 * The improvement cycle's two closing moments, derived rather than stored.
 *
 * "The owner revised after my idea, and I haven't weighed the new version" and
 * "my score moved since I revised" are both facts about live state, not events.
 * Computing them per render — instead of firing and recording them — is what
 * makes them impossible to double-fire, impossible to leave stale, and
 * consistent across a student's devices without a single extra write.
 *
 * Everything here is pure over the deliberation state, so it unit-tests without
 * Firestore and without a DOM.
 */

import { AgoraSuggestionStatus } from '@freedi/shared-types';
import {
	getDeliberationState,
	getOwnerThreads,
	isSuggestionKind,
	type AgoraProposal,
} from './proposals';

/**
 * THE edit clock.
 *
 * `agoraScores.lastEditAt` is the only trustworthy one: the statement's own
 * `lastUpdate` is bumped by the evaluation pipeline's aggregate writes, so a
 * proposal nobody has touched looks freshly edited every time somebody rates it.
 *
 * The fallback is deliberately asymmetric. A missing score DOC means nobody has
 * rated yet, and the statement's clock is then the only clock there is. A score
 * doc WITHOUT the field is a legacy doc, and falling back there would light
 * every moment in this file on every rating — so it reads as "no edit known",
 * and the moments fail closed.
 */
export function editClock(proposalId: string, fallback?: number): number {
	const score = getDeliberationState().scores[proposalId];
	if (!score) return fallback ?? 0;

	return score.lastEditAt ?? 0;
}

/**
 * The OWNER's baseline for "who has answered my revision?".
 *
 * Deliberately more forgiving than `editClock`: it falls back to the statement's
 * own clock whenever `lastEditAt` is missing, because the two questions fail in
 * opposite directions. Asking "did the owner revise?" wrongly must not invent an
 * edit, so `editClock` returns 0 and shows nothing. Asking "who answered since I
 * saved?" wrongly must not inflate the count, and the statement clock — pushed
 * forward by every rating — under-counts, which is the safe direction.
 */
export function answerBaseline(proposalId: string, fallback: number): number {
	return getDeliberationState().scores[proposalId]?.lastEditAt ?? fallback;
}

/**
 * Classmates who (re)rated after `sinceMs`. Counts raters who ACTED, not raters
 * who changed their mind — the client never receives other students' rating
 * values, only that they wrote.
 */
export function ratingsMovedSince(proposalId: string, sinceMs: number, excludeUid: string): number {
	return (getDeliberationState().studentEvalTimes[proposalId] ?? []).filter(
		(entry) => entry.evaluatorId !== excludeUid && entry.updatedAt > sinceMs,
	).length;
}

/** When this helper last offered an idea here. 0 = never. */
export function latestSuggestionAt(proposalId: string, helperUid: string): number {
	let latest = 0;
	for (const message of getDeliberationState().suggestions[proposalId] ?? []) {
		if (message.creatorId !== helperUid || !isSuggestionKind(message)) continue;
		// createdAt, NOT lastUpdate: resolving a suggestion bumps its lastUpdate,
		// which would push my idea's clock past an edit that actually followed it
		latest = Math.max(latest, message.createdAt);
	}

	return latest;
}

/**
 * When the owner last acknowledged one of this helper's ideas. 0 = never.
 *
 * A thank-you is that mark today — the accept → woven-in tray retired — and
 * `implemented` stays readable so older sessions keep their history.
 */
export function ideaLandedAt(proposalId: string, helperUid: string): number {
	let landed = 0;
	for (const message of getDeliberationState().suggestions[proposalId] ?? []) {
		if (message.creatorId !== helperUid) continue;
		if (
			message.suggestionStatus !== AgoraSuggestionStatus.thanked &&
			message.suggestionStatus !== AgoraSuggestionStatus.implemented
		) {
			continue;
		}
		landed = Math.max(landed, message.statusChangedAt ?? message.lastUpdate);
	}

	return landed;
}

/**
 * Optimistic acknowledgment of a re-rate.
 *
 * `evaluation.updatedAt` is stamped by the student's device and `lastEditAt` by
 * a Cloud Function, so on a slow clock a genuine re-rate can land BEFORE the
 * edit it answers and the invitation would never clear. Recording which edit
 * was answered — rather than when — sidesteps the skew entirely, and also stops
 * the block surviving the press for a beat, which reads as "it didn't work".
 */
const answeredEdits: Record<string, number> = {};

export function noteReWeighed(proposalId: string): void {
	answeredEdits[proposalId] = Math.max(answeredEdits[proposalId] ?? 0, editClock(proposalId));
}

/** Session teardown, and a clean slate between tests */
export function clearReWeighMemory(): void {
	for (const key of Object.keys(answeredEdits)) delete answeredEdits[key];
}

/** Did I answer this exact edit, by the write or by the optimistic mark? */
function answeredSince(proposalId: string, editedAt: number): boolean {
	const myRating = getDeliberationState().myRatings[proposalId];
	if (myRating !== undefined && myRating.updatedAt > editedAt) return true;

	return (answeredEdits[proposalId] ?? 0) >= editedAt;
}

export interface ReWeighMoment {
	/** The edit that came after my idea */
	editedAt: number;
	mySuggestionAt: number;
	/** The owner acknowledged one of my ideas before that edit */
	credited: boolean;
	/** I never weighed this proposal at all — "weigh it", not "weigh it again" */
	neverRated: boolean;
}

/**
 * The helper's moment: the owner revised after my idea and I have not weighed
 * the new version.
 *
 * Note what this deliberately does NOT claim — that my idea is in the text. The
 * trigger is an edit that FOLLOWED my idea, nothing more; the diff sitting above
 * it in the thread is the evidence, and the student judges for themselves.
 */
export function reWeighMoment(
	proposalId: string,
	helperUid: string,
	proposal: AgoraProposal,
): ReWeighMoment | null {
	// A student's conversation with themselves is nobody's re-weigh
	if (helperUid === proposal.creatorId) return null;

	const mySuggestionAt = latestSuggestionAt(proposalId, helperUid);
	if (mySuggestionAt === 0) return null;

	const editedAt = editClock(proposalId, proposal.lastUpdate);
	if (editedAt === 0 || editedAt <= mySuggestionAt) return null;
	if (answeredSince(proposalId, editedAt)) return null;

	const landedAt = ideaLandedAt(proposalId, helperUid);

	return {
		editedAt,
		mySuggestionAt,
		credited: landedAt > 0 && landedAt <= editedAt,
		neverRated: getDeliberationState().myRatings[proposalId] === undefined,
	};
}

/**
 * The ONE helper a revision's score movement is credited to: whoever's idea the
 * owner acknowledged most recently before saving.
 *
 * Without a single answer, an owner who thanked three classmates before one save
 * would see the same "+12" claimed in three different conversations. Ties break
 * on uid so every device in the room computes the same helper.
 */
export function creditedHelperFor(proposalId: string, editedAt: number): string | null {
	let bestUid: string | null = null;
	let bestLanded = 0;
	for (const helperUid of getOwnerThreads(proposalId).keys()) {
		const landed = ideaLandedAt(proposalId, helperUid);
		if (landed === 0 || landed > editedAt) continue;
		if (landed > bestLanded || (landed === bestLanded && bestUid !== null && helperUid < bestUid)) {
			bestLanded = landed;
			bestUid = helperUid;
		}
	}

	return bestUid;
}

export interface ScoreMovedMoment {
	/** Classmates who re-rated since the revision */
	reRaters: number;
	bridgeNow: number;
	/** 0 when the pre-edit baseline is unknown — never NaN */
	bridgeDelta: number;
	editedAt: number;
}

/**
 * The owner's moment: the class answered my revision.
 *
 * Credited by PLACEMENT — it renders in the thread of the helper whose idea led
 * to the revision — while the numbers stay attributed to the class. The helper
 * caused the revision; the class caused the score. Fusing those two into "your
 * score rose because of X" would denominate a classmate's goodwill in points and
 * would hand them the blame the next time it falls.
 */
export function scoreMovedMoment(
	proposalId: string,
	ownerUid: string,
	helperUid: string,
	proposal: AgoraProposal,
): ScoreMovedMoment | null {
	if (proposal.creatorId !== ownerUid || helperUid === ownerUid) return null;

	const editedAt = editClock(proposalId);
	if (editedAt === 0) return null;
	if (creditedHelperFor(proposalId, editedAt) !== helperUid) return null;

	const reRaters = ratingsMovedSince(proposalId, editedAt, ownerUid);
	// Silence until somebody answers: "0 so far" is a nag, not news
	if (reRaters === 0) return null;

	const score = getDeliberationState().scores[proposalId];
	const bridgeNow = score?.bridgingScore ?? 0;
	const baseline = score?.bridgingAtLastEdit;

	return {
		reRaters,
		bridgeNow,
		bridgeDelta: baseline === undefined ? 0 : bridgeNow - baseline,
		editedAt,
	};
}

/**
 * The full circle, closed: an idea went out, the owner acknowledged it, the text
 * changed after that, and the helper weighed the new version.
 *
 * Direction-blind on purpose. A round trip that only counted when the score rose
 * would be paying the helper to vote up — the exact pressure the re-weigh block
 * is built to resist.
 */
export function roundTripClosed(proposalId: string, helperUid: string): boolean {
	const landedAt = ideaLandedAt(proposalId, helperUid);
	if (landedAt === 0) return false;

	const editedAt = editClock(proposalId);
	if (editedAt === 0 || editedAt < landedAt) return false;

	return answeredSince(proposalId, editedAt);
}

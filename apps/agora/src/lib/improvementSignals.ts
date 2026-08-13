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

import { agoraClassSupport, AgoraSuggestionStatus } from '@freedi/shared-types';
import {
	getDeliberationState,
	getOwnerThreads,
	isSuggestionKind,
	type AgoraProposal,
} from './proposals';

/**
 * THE edit clock: when the owner last actually rewrote the text.
 *
 * `agoraScores.lastEditAt` is the only trustworthy source, and there is
 * deliberately NO fallback to the statement's own `lastUpdate`. That clock
 * moves for reasons that have nothing to do with anybody editing anything —
 * the evaluation pipeline writes its aggregates back onto the proposal doc,
 * and a child write (a suggestion, a chat message — including the reader's
 * OWN suggestion) bumps it too. Trusting it announced "the proposal was
 * revised" to a helper the moment they finished writing to a proposal nobody
 * had touched.
 *
 * A Cloud Function stamps `lastEditAt` on every real text change, seeding a
 * whole score doc if none exists yet, so a genuine edit always has one. No
 * stamp therefore means no known edit, and every moment in this file stays
 * silent — the safe direction, since the alternative is claiming a revision
 * that never happened.
 */
export function editClock(proposalId: string): number {
	return getDeliberationState().scores[proposalId]?.lastEditAt ?? 0;
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
/** When that press happened, for the beat before the listener echoes it back */
const answeredAt: Record<string, number> = {};

export function noteReWeighed(proposalId: string, now = Date.now()): void {
	answeredEdits[proposalId] = Math.max(answeredEdits[proposalId] ?? 0, editClock(proposalId));
	answeredAt[proposalId] = now;
}

/** Session teardown, and a clean slate between tests */
export function clearReWeighMemory(): void {
	for (const key of Object.keys(answeredEdits)) delete answeredEdits[key];
	for (const key of Object.keys(answeredAt)) delete answeredAt[key];
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

	const editedAt = editClock(proposalId);
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

export interface SupportSinceEdit {
	/** Class average support, 0-100. Undefined until a classmate has rated. */
	now: number | undefined;
	/**
	 * How far it moved since the owner's last save. Undefined when the class had
	 * not spoken at the moment of that save, so there is nothing to move FROM —
	 * which is a different sentence from "it did not move", and must not be
	 * flattened into 0.
	 */
	delta: number | undefined;
}

/**
 * The number the author's improvement loop reports: what the class thinks now,
 * and how far that has travelled since they last rewrote the text.
 *
 * The average rather than the bridging score, on purpose — see
 * `agoraClassSupport`. A classmate who moves from "against" to "not sure" has
 * changed their mind, which is the biggest thing a revision can win, and the
 * blended score can round that away to nothing. Telling an author "it has not
 * moved" when it has is the one failure this whole loop cannot afford.
 */
export function supportSinceEdit(proposalId: string): SupportSinceEdit {
	const score = getDeliberationState().scores[proposalId];
	const now = score ? agoraClassSupport(score.perCamp)?.percent : undefined;
	const baseline = score?.supportAtLastEdit;

	return {
		now,
		delta: now === undefined || baseline === undefined ? undefined : now - baseline,
	};
}

export interface ScoreMovedMoment {
	/** Classmates who re-rated since the revision */
	reRaters: number;
	/** The class average, and how far it moved since the revision */
	support: SupportSinceEdit;
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
		support: supportSinceEdit(proposalId),
		bridgeNow,
		bridgeDelta: baseline === undefined ? 0 : bridgeNow - baseline,
		editedAt,
	};
}

/**
 * The full circle, closed: an idea went out, the owner acknowledged it, the text
 * changed after that, and the helper weighed the new version. Returns WHEN it
 * closed — the moment the helper answered the revision — or 0 if it has not.
 *
 * It returns a time rather than a boolean because a round trip is a thing that
 * HAPPENED: it belongs in the conversation at its own moment, not pinned under
 * everything else for the rest of the lesson, drifting further from the exchange
 * it describes with every message that follows.
 *
 * Direction-blind on purpose. A round trip that only counted when the score rose
 * would be paying the helper to vote up — the exact pressure the re-weigh block
 * is built to resist.
 */
export function roundTripAt(proposalId: string, helperUid: string): number {
	const landedAt = ideaLandedAt(proposalId, helperUid);
	if (landedAt === 0) return 0;

	const editedAt = editClock(proposalId);
	if (editedAt === 0 || editedAt < landedAt) return 0;

	// Both sides can date it: every student's rating TIME streams to everyone
	// (the values never do), so the owner reads the same moment the helper does
	let ratedAt = 0;
	for (const entry of getDeliberationState().studentEvalTimes[proposalId] ?? []) {
		if (entry.evaluatorId !== helperUid || entry.updatedAt <= editedAt) continue;
		ratedAt = Math.max(ratedAt, entry.updatedAt);
	}
	if (ratedAt > 0) return ratedAt;

	// The press just happened and the snapshot has not come back yet. Only ever
	// true on the helper's own device, since nobody rates their own proposal.
	if ((answeredEdits[proposalId] ?? 0) >= editedAt) return answeredAt[proposalId] ?? 0;

	return 0;
}

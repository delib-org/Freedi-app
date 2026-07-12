import {
	object,
	string,
	number,
	array,
	record,
	InferOutput,
} from 'valibot';
import { AGORA_AI_REVIEW } from './agoraConstants';

/**
 * An in-character AI review of a student's proposal ("show your proposal
 * to the Count"). One doc per proposal × character, overwritten on re-asks.
 * Doc id: `${statementId}--${characterId}`. Function-write only.
 */
export const AgoraCharacterReviewSchema = object({
	reviewId: string(),
	sessionId: string(),
	statementId: string(),
	characterId: string(),
	/** First-person, in-character verdict: what works for me, what would make me accept it */
	verdictText: string(),
	/** How acceptable the proposal is to this character, 0-100 */
	acceptanceScore: number(),
	/** Concrete, actionable improvement advice */
	advice: array(string()),
	/** Review requests used per round, keyed by String(roundNumber) — rate limiting */
	asksByRound: record(string(), number()),
	/** Round in which the latest review was produced */
	roundNumber: number(),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraCharacterReview = InferOutput<typeof AgoraCharacterReviewSchema>;

export function createAgoraCharacterReviewId(
	statementId: string,
	characterId: string
): string {
	return `${statementId}--${characterId}`;
}

/** Deterministic uid of one of a character's synthetic rater identities (index 1-based) */
export function createAgoraAiRaterUid(characterId: string, index: number): string {
	return `${AGORA_AI_REVIEW.AI_UID_PREFIX}${characterId}--${index}`;
}

/** True for synthetic AI rater uids — used to exclude them from student-only metrics */
export function isAgoraAiUid(uid: string): boolean {
	return uid.startsWith(AGORA_AI_REVIEW.AI_UID_PREFIX);
}

/** Map a 0-100 acceptance score onto the evaluation scale (-1..+1), 2-decimal rounded */
export function agoraScoreToEvaluation(score: number): number {
	const clamped = Math.min(100, Math.max(0, score));

	return Math.round((clamped / 50 - 1) * 100) / 100;
}

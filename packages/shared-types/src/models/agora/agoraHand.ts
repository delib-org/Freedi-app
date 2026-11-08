/**
 * The hand of classmates' notes a student is dealt at a station.
 *
 * In a class larger than a handful, nobody can read every note, and a note
 * written late in the lesson would otherwise reach nobody. So notes are dealt
 * by lottery: a hand of HAND_SIZE at first, topped up while the pool is short,
 * and once a student has rated their whole hand they receive the notes the
 * class has read least — one at a time — until every note has MIN_RATERS.
 *
 * "Dealt" is counted from the hands themselves (how many hands hold a note),
 * never from `statement.evaluation`: Agora notes carry no evaluation block
 * until the first rating, and a partial one breaks the rating pipeline.
 *
 * Doc id: `${sessionId}--${uid}` in `agoraHands`. Server-written only; the
 * owner may read it.
 */

import { array, number, object, record, string, InferOutput } from 'valibot';
import { AGORA_LOTTERY } from './agoraConstants';

export const AgoraHandSchema = object({
	sessionId: string(),
	userId: string(),
	/** Dealt note ids per parent (question statement / challenge question), in deal order */
	hands: record(string(), array(string())),
	lastUpdate: number(),
});

export type AgoraHand = InferOutput<typeof AgoraHandSchema>;

export function createAgoraHandId(sessionId: string, userId: string): string {
	return `${sessionId}--${userId}`;
}

/** Students only — the teacher and AI participants never count */
export function lotteryActive(studentCount: number): boolean {
	return studentCount > AGORA_LOTTERY.MAX_STUDENTS_WITHOUT_LOTTERY;
}

/** How many notes a hand aims for: the hand size, or every classmate when there are fewer */
export function handGoal(peers: number): number {
	return Math.max(0, Math.min(AGORA_LOTTERY.HAND_SIZE, peers));
}

export type DealNotesMode = 'fill' | 'more';

export interface DealNotesRequest {
	sessionId: string;
	/** The question statement whose notes are dealt (`item.statementId` or `challengeQuestionId`) */
	parentId: string;
	mode: DealNotesMode;
}

export interface DealNotesResponse {
	/** False when the class is small enough that everyone reads everything */
	active: boolean;
	/** The whole hand for this parent after the call */
	hand: string[];
	/** The ids this call added */
	dealt: string[];
	/** Nothing is left to draw for this student */
	poolExhausted: boolean;
}

export interface DealCandidate {
	statementId: string;
	/** How many hands in the session already hold this note */
	dealtCount: number;
}

export interface PlanDealInput {
	mode: DealNotesMode;
	/** The student's current hand for this parent */
	hand: readonly string[];
	/** Everything the student has rated under this parent */
	rated: ReadonlySet<string>;
	/** Notes the student could still be dealt: not theirs, not held, not rated, not hidden */
	candidates: readonly DealCandidate[];
	/** Tie-break source, injectable for tests */
	random?: () => number;
}

export interface PlanDealResult {
	dealt: string[];
	poolExhausted: boolean;
}

/** Least-dealt first; equal counts in random order so a class does not open on the same note */
export function orderCandidates(
	candidates: readonly DealCandidate[],
	random: () => number = Math.random,
): DealCandidate[] {
	const shuffled = candidates.map((candidate) => ({ candidate, key: random() }));
	shuffled.sort((a, b) => a.candidate.dealtCount - b.candidate.dealtCount || a.key - b.key);

	return shuffled.map((row) => row.candidate);
}

/**
 * Which notes to add to a hand now.
 *
 * `fill` (the automatic call): top up while the hand is short of HAND_SIZE;
 * once it is full and every held note is rated, ONE more note that still
 * lacks MIN_RATERS deals; otherwise nothing.
 * `more` (the student's own ask): another HAND_SIZE of the least-dealt rest.
 */
export function planDeal(input: PlanDealInput): PlanDealResult {
	const ordered = orderCandidates(input.candidates, input.random);
	const take = (count: number): string[] =>
		ordered.slice(0, Math.max(0, count)).map((candidate) => candidate.statementId);

	let dealt: string[] = [];
	if (input.mode === 'more') {
		dealt = take(AGORA_LOTTERY.HAND_SIZE);
	} else {
		const short = AGORA_LOTTERY.HAND_SIZE - input.hand.length;
		if (short > 0) {
			dealt = take(short);
		} else if (input.hand.every((statementId) => input.rated.has(statementId))) {
			const underRead = ordered.find(
				(candidate) => candidate.dealtCount < AGORA_LOTTERY.MIN_RATERS,
			);
			dealt = underRead ? [underRead.statementId] : [];
		}
	}

	return { dealt, poolExhausted: ordered.length - dealt.length === 0 };
}

/**
 * The challenge round: students take turns putting a new option on a ballot
 * that is already being voted on.
 *
 * A deliberation decides what a class votes about, and until now that decision
 * was final — a student who thought of something better once the vote had
 * started had nowhere to put it. Here they do, and the cost is that they must
 * convince the room in front of the room: the challenger is pinned on top, the
 * board becomes N+1, everyone may move the single vote they already hold, and
 * when the teacher closes the window the option with the fewest votes falls.
 *
 * The rule is deliberately harsh in one direction. The challenger must
 * STRICTLY beat the weakest incumbent, so a tie leaves the board alone: an
 * option nobody moved toward has not displaced an option somebody chose, and a
 * class that did not move kept the ballot it had. The tie-breaks below mirror
 * `pickVoteWinner` in the same folder, inverted, so every reader of the same
 * data evicts the same option.
 *
 * Lives in the vote models rather than the agora ones for the same reason the
 * rest of this folder does: nothing here knows what a classroom is.
 */

import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	record,
	enum_,
	InferOutput,
} from 'valibot';

/** Where a turn is. The session doc holds exactly one of these at a time. */
export enum ChallengePhase {
	/** Between turns. The next speaker is named; the floor is not open yet. */
	idle = 'idle',
	/** The speaker is writing, or deciding to pass. Nobody else is interrupted. */
	floor = 'floor',
	/** The board is N+1 and the room may move its votes. Counts are hidden. */
	vote = 'vote',
	/**
	 * The count is being taken. A closing beat rather than a state anyone rests
	 * in: it exists so that a vote arriving mid-count is either counted or
	 * visibly refused, never silently dropped.
	 */
	resolving = 'resolving',
	/** Counted. The outcome stands on screen until the teacher calls the next student. */
	resolved = 'resolved',
	/** The round is over; the standing ballot is what the class votes on. */
	ended = 'ended',
}

/** How a turn ended. A pass and a skip are not defeats and must not read as one. */
export enum ChallengeResolvedBy {
	/** The class voted on it */
	vote = 'vote',
	/** The student chose not to use their turn */
	pass = 'pass',
	/** The teacher moved the round along */
	skip = 'skip',
}

export const ChallengeOutcomeSchema = object({
	speakerUserId: string(),
	speakerAnonName: string(),
	/** Absent when the speaker passed or was skipped — there was nothing to judge */
	challengerStatementId: optional(string()),
	/** Carried, not looked up: see VotingGameStateSchema.challengerStatement */
	challengerStatement: optional(string()),
	survived: boolean(),
	by: enum_(ChallengeResolvedBy),
	challengerVotes: number(),
	/** Votes per statementId at the close, challenger included. The reveal reads this. */
	counts: record(string(), number()),
	/** The incumbent the challenger displaced, when it displaced one */
	evictedStatementId: optional(string()),
	evictedStatement: optional(string()),
	pointsAwarded: number(),
	resolvedAt: number(),
});

export type ChallengeOutcome = InferOutput<typeof ChallengeOutcomeSchema>;

/**
 * The round's runtime state. Server-owned and rules-frozen exactly like the
 * ballot: the turn order, the phase and the outcome are facts the whole class
 * must agree on, so no client writes them, not even the teacher's.
 */
export const VotingGameStateSchema = object({
	/** Seat order over non-AI participants, taken once when the round started */
	order: array(string()),
	/**
	 * Anon names in the same order. Denormalised so the roster renders from the
	 * session doc alone — the voting stage attaches no participants listener.
	 */
	orderNames: array(string()),
	turnIndex: number(),
	/** Resolved from settings at start time, so raising the cap later cannot rewrite history */
	maxTurns: number(),
	phase: enum_(ChallengePhase),
	speakerUserId: optional(string()),
	speakerAnonName: optional(string()),
	challengerStatementId: optional(string()),
	/**
	 * The challenger's text, carried on the session rather than read from the
	 * statement. The voting stage holds no statements listener, so a phone that
	 * reloaded mid-round has no other source for it and would pin a blank row.
	 */
	challengerStatement: optional(string()),
	/** Students who used their turn to pass. A fact about them nothing else records. */
	passedUserIds: array(string()),
	/** Students the teacher moved past */
	skippedUserIds: array(string()),
	/** The last turn that finished — the reveal card reads from here */
	lastOutcome: optional(ChallengeOutcomeSchema),
	startedAt: number(),
	/** When the current turn opened. The teacher's pacing arithmetic, nothing else. */
	turnStartedAt: optional(number()),
	updatedAt: number(),
});

export type VotingGameState = InferOutput<typeof VotingGameStateSchema>;

export interface ChallengeResolution {
	survived: boolean;
	challengerVotes: number;
	/** Present only when the challenger survived AND there was an incumbent to displace */
	evictedStatementId?: string;
	/** The board as it should be written back, survivors in their original order */
	boardIds: string[];
}

/**
 * Does the challenger take a seat, and whose?
 *
 * It survives iff it strictly out-polls the weakest incumbent. Among incumbents
 * tied at the minimum the seat is taken from the one with the lowest consensus,
 * and then the lowest statementId — the mirror of `pickVoteWinner`'s tie-break,
 * so the choice is deterministic rather than whatever order Firestore returned.
 *
 * An empty board needs no special case: with no incumbents there is no weakest
 * to beat, so the challenger stands and displaces nobody.
 */
export function resolveChallenge(
	counts: Record<string, number>,
	boardIds: string[],
	challengerId: string,
	consensusById: Record<string, number>,
): ChallengeResolution {
	const challengerVotes = counts[challengerId] ?? 0;

	if (boardIds.length === 0) {
		return { survived: true, challengerVotes, boardIds: [challengerId] };
	}

	const weakest = [...boardIds].sort((a, b) => {
		const countA = counts[a] ?? 0;
		const countB = counts[b] ?? 0;
		if (countA !== countB) return countA - countB;
		const consensusA = consensusById[a] ?? 0;
		const consensusB = consensusById[b] ?? 0;
		if (consensusA !== consensusB) return consensusA - consensusB;

		return a < b ? -1 : a > b ? 1 : 0;
	})[0];

	// Strictly. Matching the weakest is not beating it.
	if (challengerVotes <= (counts[weakest] ?? 0)) {
		return { survived: false, challengerVotes, boardIds: [...boardIds] };
	}

	return {
		survived: true,
		challengerVotes,
		evictedStatementId: weakest,
		boardIds: [...boardIds.filter((id) => id !== weakest), challengerId],
	};
}

export interface SeatedStudent {
	userId: string;
	anonName: string;
}

/**
 * The rotation: everyone seated, in the order they joined, AI bots excluded.
 * Taken once when the round starts so a latecomer cannot reshuffle a turn
 * order the class has already watched half of.
 */
export function seatOrder(
	participants: Array<{ userId: string; anonName: string; joinedAt: number; isAI?: boolean }>,
): SeatedStudent[] {
	return participants
		.filter((participant) => participant.isAI !== true)
		.slice()
		.sort((a, b) => a.joinedAt - b.joinedAt)
		.map(({ userId, anonName }) => ({ userId, anonName }));
}

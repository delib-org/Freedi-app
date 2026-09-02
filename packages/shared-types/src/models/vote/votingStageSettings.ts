/**
 * A voting stage held over options a deliberation produced.
 *
 * Lives in the vote models rather than the agora ones on purpose: Odyssey
 * runs the same election over an island's proposals, and nothing here knows
 * what a classroom is. Selection reuses `ResultsSettings` — the same shape,
 * the same `statement.consensus` metric, and the same server-side selector
 * (`updateParentStatementWithChosenOptions`) every other Freedi app uses to
 * answer "which options are the leading ones".
 */

import { object, string, number, boolean, optional, array, InferOutput } from 'valibot';
import {
	ResultsSettingsSchema,
	ResultsSettings,
	ResultsBy,
	CutoffBy,
} from '../results/ResultsSettings';
import { AGORA_VOTING } from '../agora/agoraConstants';

export const VotingStageSettingsSchema = object({
	/** `undefined` means enabled — a session written before voting existed still votes */
	enabled: optional(boolean()),
	/** Which options reach the ballot. Defaults to the top `DEFAULT_TOP_X` by consensus. */
	selection: optional(ResultsSettingsSchema),
	/**
	 * A win condition on top of the count: the most-voted option only *wins* if
	 * its consensus clears this. Unset means the most-voted option always wins.
	 */
	winningConsensusThreshold: optional(number()),
	/**
	 * Whether voters see the tallies while the vote is open.
	 *
	 * Default OFF, and deliberately: a running count is an argument. Show it and
	 * the leading option gathers votes for leading, which is the one thing a
	 * vote is supposed to measure independently. The teacher reveals it when
	 * they want the room to see where it stands — usually at the close.
	 *
	 * How MANY have voted is never hidden by this; only who they voted for.
	 */
	showResults: optional(boolean()),
	/**
	 * Whether the ballot re-sorts by votes as they arrive. Only has an effect
	 * while the tallies are shown — reordering by a number nobody can see would
	 * leak it, and a ballot that moves under a voter's finger loses their place.
	 */
	liveReorder: optional(boolean()),
	/**
	 * Whether students may put NEW options on the ballot while the vote runs,
	 * one student at a time (the challenge round).
	 *
	 * `undefined` means OFF — the opposite of `enabled` above, and on purpose.
	 * `enabled` defaults on because a session written before voting existed
	 * should still hold a vote; this defaults off because no session ever
	 * agreed to let its ballot be rewritten mid-election. A teacher opts in.
	 */
	challengeGame: optional(boolean()),
	/**
	 * Turns the challenge round runs before closing itself. Unset means
	 * `AGORA_CHALLENGE.DEFAULT_MAX_TURNS`. Only read when `challengeGame`.
	 */
	challengeMaxTurns: optional(number()),
});

export type VotingStageSettings = InferOutput<typeof VotingStageSettingsSchema>;

/** One candidate as it stood when the ballot was drawn up */
export const VotingCandidateSchema = object({
	statementId: string(),
	statement: string(),
	consensus: number(),
});

export type VotingCandidate = InferOutput<typeof VotingCandidateSchema>;

/**
 * The ballot, frozen. Ratings keep arriving during the vote and the shared
 * trigger keeps rewriting the parent's `results`, so the list of who is ON the
 * ballot is snapshotted when the stage opens and read from here afterwards.
 */
export const VotingStateSchema = object({
	candidateIds: array(string()),
	candidates: array(VotingCandidateSchema),
	computedAt: number(),
});

export type VotingState = InferOutput<typeof VotingStateSchema>;

/** Written when a vote is withdrawn — a vote doc is never deleted, so the trigger can decrement */
export const NO_VOTE = 'none';

/**
 * The "no" of a one-candidate ballot. A ballot with a single proposal is not
 * a choice between options but a question — do we adopt this? — so the
 * against side needs a place to be counted. It is a sentinel statementId in
 * the same vote doc, and the ballot's `candidateIds` carry it so the tally
 * counts it like any candidate. It is never a winner (see `pickVoteWinner`).
 */
export const VOTE_AGAINST = 'against';

/** Vote ids that name no option doc — the shared vote trigger must not look them up */
export function isVoteSentinel(statementId: string): boolean {
	return statementId === NO_VOTE || statementId === VOTE_AGAINST;
}

/** The ids a ballot tallies: the candidates, plus the against side when there is exactly one */
export function ballotTallyIds(candidateIds: readonly string[]): string[] {
	return candidateIds.length === 1 ? [...candidateIds, VOTE_AGAINST] : [...candidateIds];
}

/**
 * Fills the teacher's partial settings out into the complete `ResultsSettings`
 * the shared selector expects.
 */
export function resolveVotingSelection(settings?: VotingStageSettings): ResultsSettings {
	const selection = settings?.selection;
	const cutoffBy = selection?.cutoffBy ?? CutoffBy.topOptions;

	return {
		resultsBy: selection?.resultsBy ?? ResultsBy.consensus,
		cutoffBy,
		numberOfResults: selection?.numberOfResults ?? AGORA_VOTING.DEFAULT_TOP_X,
		cutoffNumber: selection?.cutoffNumber ?? AGORA_VOTING.DEFAULT_CUTOFF_CP,
	};
}

/**
 * Counts one vote per voter. Withdrawn votes (`statementId === NO_VOTE`) and
 * votes for anything not on the ballot are ignored rather than counted
 * anywhere — a vote for a removed option is not a vote for its neighbour.
 */
export function tallyVotes(
	votes: Array<{ statementId: string; userId: string }>,
	candidateIds: string[],
): Record<string, number> {
	const ballot = new Set(candidateIds);
	const counts: Record<string, number> = {};
	const counted = new Set<string>();

	for (const vote of votes) {
		if (vote.statementId === NO_VOTE) continue;
		if (!ballot.has(vote.statementId)) continue;
		// One doc per (user, question) makes this belt-and-braces, but a caller
		// passing a raw query result should not be able to double-count a voter.
		if (counted.has(vote.userId)) continue;
		counted.add(vote.userId);
		counts[vote.statementId] = (counts[vote.statementId] ?? 0) + 1;
	}

	return counts;
}

export interface VoteWinner {
	/** Absent when nobody voted, and on a one-candidate ballot the room turned down */
	winnerStatementId?: string;
	/** True when there is a winner AND it clears `winningConsensusThreshold` */
	metThreshold: boolean;
	total: number;
	/** One-candidate ballot only: the against side won (or tied — adopting needs a majority) */
	rejected?: boolean;
}

/**
 * The elected option. Ties break on consensus, then on statementId, so every
 * reader of the same data names the same winner.
 *
 * On a one-candidate ballot the `against` sentinel is in the counts; the
 * proposal is adopted only when it strictly out-votes it, and the sentinel is
 * never named as the winner.
 */
export function pickVoteWinner(
	counts: Record<string, number>,
	consensusById: Record<string, number>,
	winningConsensusThreshold?: number,
): VoteWinner {
	const entries = Object.entries(counts).filter(([, count]) => count > 0);
	const total = entries.reduce((sum, [, count]) => sum + count, 0);

	if (entries.length === 0) {
		return { metThreshold: false, total: 0 };
	}

	if (VOTE_AGAINST in counts) {
		const against = counts[VOTE_AGAINST] ?? 0;
		const candidate = entries.find(([id]) => id !== VOTE_AGAINST);
		if (!candidate || candidate[1] <= against) {
			return { metThreshold: false, total, rejected: true };
		}
		const [winnerStatementId] = candidate;
		const metThreshold =
			winningConsensusThreshold === undefined
				? true
				: (consensusById[winnerStatementId] ?? 0) >= winningConsensusThreshold;

		return { winnerStatementId, metThreshold, total, rejected: false };
	}

	entries.sort(([aId, aCount], [bId, bCount]) => {
		if (bCount !== aCount) return bCount - aCount;
		const aCp = consensusById[aId] ?? 0;
		const bCp = consensusById[bId] ?? 0;
		if (bCp !== aCp) return bCp - aCp;

		return aId < bId ? -1 : aId > bId ? 1 : 0;
	});

	const winnerStatementId = entries[0][0];
	const metThreshold =
		winningConsensusThreshold === undefined
			? true
			: (consensusById[winnerStatementId] ?? 0) >= winningConsensusThreshold;

	return { winnerStatementId, metThreshold, total };
}

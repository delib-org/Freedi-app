import type { LessonStatus, LessonStepKey, Statement } from '@freedi/shared-types';
import { summaryOf } from './voteSummary';
import type { SummaryBallot, VoteSummary } from './voteSummary';

/**
 * "The decision" as the TEACHER's console reads it. It is built from the same `summaryOf` that
 * feeds the phones and the projector, so the console, the projector and the students can never
 * name different winners; the only difference is who may see it. The teacher always sees the
 * decision (even while the results are closed to the class); the projector and the phones keep
 * their own rule, `decisionVisibleToClass`, which this file shares with them.
 */

export type DecisionKind = 'none' | 'open' | 'paused' | 'decided';

export interface DecisionRow {
	id: string;
	text: string;
	percent: number;
	count: number;
	winner: boolean;
}

export interface Decision {
	kind: DecisionKind;
	/** The winning proposal (or, with no vote, the most agreed one); null while there is none. */
	text: string | null;
	/** The winner's share and votes, only when a vote was held and closed. */
	percent: number | null;
	votes: number | null;
	/** The top proposals, winner first. */
	top: DecisionRow[];
	voted: number;
	present: number;
	/** Closed with the top vote count shared: the ratings decided. */
	tie: boolean;
	/** No vote was held: `text` is the most agreed proposal. */
	mostAgreed: boolean;
	/** The class sees these results too (otherwise only the teacher's screen does). */
	sharedWithClass: boolean;
}

export interface DecisionInput {
	ballot: SummaryBallot | null;
	selections: Record<string, number> | undefined;
	proposals: readonly Statement[];
	present: number;
	/** The teacher opened the results to the class. */
	resultsShown: boolean;
}

export const TOP_ROWS = 3;

function kindOf(summary: VoteSummary): DecisionKind {
	if (summary.kind === 'closed') return 'decided';

	return summary.kind;
}

export function decisionOf(input: DecisionInput): Decision {
	// The teacher's own view: always the real tally, whatever the class may see.
	const summary = summaryOf({
		ballot: input.ballot,
		selections: input.selections,
		proposals: input.proposals,
		present: input.present,
		resultsShown: true,
	});
	const decided = summary.kind === 'closed';
	const winner = summary.rows.find((row) => row.winner);

	return {
		kind: kindOf(summary),
		text: summary.decisionText,
		percent: decided && winner ? winner.percent : null,
		votes: decided && winner ? winner.count : null,
		top: summary.rows.slice(0, TOP_ROWS).map((row) => ({
			id: row.id,
			text: row.text,
			percent: row.percent,
			count: row.count,
			winner: row.winner,
		})),
		voted: summary.voted,
		present: summary.present,
		tie: summary.tie,
		mostAgreed: summary.mostAgreed,
		sharedWithClass: input.resultsShown,
	};
}

/**
 * The projector's rule (and the phones'): a decision card is drawn only when there is a decision and
 * its results are open to the class. Closed results would tell the winner.
 */
export function decisionVisibleToClass(
	summary: Pick<VoteSummary, 'kind' | 'resultsHidden'>,
): boolean {
	return (summary.kind === 'none' || summary.kind === 'closed') && !summary.resultsHidden;
}

export interface DecisionPlacement {
	stepKey: LessonStepKey;
	status: LessonStatus;
	ballotClosed: boolean;
}

/** Where the console shows the decision: Vote (once closed), Summary, and an open or ended lesson. */
export function showsDecision(at: DecisionPlacement): boolean {
	if (at.status === 'open' || at.status === 'ended') return true;

	return at.stepKey === 'summary' || (at.stepKey === 'vote' && at.ballotClosed);
}

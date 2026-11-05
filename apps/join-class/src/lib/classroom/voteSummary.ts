import type { ClassBallot, Statement, StatementSubscription } from '@freedi/shared-types';
import { consensusOf, countsOf, orderBallot, voteResults } from './voteResults';

/**
 * What the Summary says about the vote (IA 20.2). One pure function feeds the
 * phone and the projector, so both draw the same state from the same data:
 * none (no vote held), open, paused or closed.
 */

export type SummaryKind = 'none' | 'open' | 'paused' | 'closed';

export interface SummaryRow {
	id: string;
	text: string;
	count: number;
	/** Share of the votes cast (0..100). */
	percent: number;
	/** Open vote: the single proposal ahead (never on a tie or zero votes). */
	leading: boolean;
	/** Closed vote: the decided proposal. */
	winner: boolean;
}

export interface VoteSummary {
	kind: SummaryKind;
	/** Votes per proposal, winner / leader first. Empty when no vote was held. */
	rows: SummaryRow[];
	/** Votes cast on the ballot. */
	voted: number;
	/** Students in the room. */
	present: number;
	/** The decision's text; null while there is none (open / paused). */
	decisionText: string | null;
	/** No vote was held: the decision is the most agreed proposal (highest C_p). */
	mostAgreed: boolean;
	/** Closed with the top vote count shared, so the ratings decided. */
	tie: boolean;
	/** The support question and the side bars are shown (a decision exists and is visible). */
	showSupport: boolean;
	/**
	 * A vote exists but the teacher keeps its results closed: the rows carry no
	 * counts and no winner, and there is no decision text, tie note or support
	 * question (they would all tell the winner). Trello uVEcfwbB.
	 */
	resultsHidden: boolean;
}

export type SummaryBallot = Pick<ClassBallot, 'candidateIds'> &
	Partial<Pick<ClassBallot, 'closedAt' | 'pausedAt' | 'decisionId'>>;

export interface SummaryInput {
	ballot: SummaryBallot | null;
	selections: Record<string, number> | undefined;
	/** The challenge question's proposals (hidden ones are ignored). */
	proposals: readonly Statement[];
	present: number;
	/**
	 * The teacher opened the results to the class (voteDisplay.liveResults ===
	 * true). Leave it out and the summary is the closed one: safe by default.
	 */
	resultsShown?: boolean;
}

/** Students in the room: every subscription but the teacher's. */
export function presentCount(
	roster: readonly StatementSubscription[],
	teacherId: string | undefined,
): number {
	return roster.filter((sub) => sub.userId !== teacherId).length;
}

/** Everyone present has voted (and there is someone to vote). */
export function everyoneVoted(voted: number, present: number): boolean {
	return present > 0 && voted >= present;
}

function kindOf(ballot: SummaryBallot | null): SummaryKind {
	if (!ballot) return 'none';
	// A decision is only ever written by closing the ballot.
	if (typeof ballot.closedAt === 'number' || typeof ballot.decisionId === 'string') return 'closed';

	return typeof ballot.pausedAt === 'number' ? 'paused' : 'open';
}

function textOf(proposals: readonly Statement[], id: string): string {
	return proposals.find((option) => option.statementId === id)?.statement ?? '';
}

/** The most agreed proposal: highest C_p, ties by id. */
function mostAgreedOf(proposals: readonly Statement[]): Statement | undefined {
	const visible = proposals.filter((option) => option.hide !== true);
	const ids = orderBallot(
		visible.map((option) => option.statementId),
		'consensus',
		{ consensus: consensusOf(visible), votes: {} },
		[],
		'',
	);

	return visible.find((option) => option.statementId === ids[0]);
}

export function summaryOf(input: SummaryInput): VoteSummary {
	const { ballot, selections, proposals, present } = input;
	const resultsShown = input.resultsShown === true;
	const kind = kindOf(ballot);
	if (!ballot || kind === 'none') {
		const agreed = mostAgreedOf(proposals);

		return {
			kind: 'none',
			rows: [],
			voted: 0,
			present,
			decisionText: agreed?.statement ?? null,
			mostAgreed: !!agreed,
			tie: false,
			showSupport: !!agreed,
			resultsHidden: false,
		};
	}
	if (!resultsShown) return hiddenSummary(ballot, kind, selections, proposals, present);
	const tally = voteResults(ballot.candidateIds, selections);
	const votes = countsOf(tally);
	const order = orderBallot(
		ballot.candidateIds,
		'result',
		{ consensus: consensusOf(proposals), votes },
		[],
		'',
	);
	const topCount = votes[order[0]] ?? 0;
	const secondCount = order.length > 1 ? (votes[order[1]] ?? 0) : -1;
	const decisionId = kind === 'closed' ? (ballot.decisionId ?? order[0]) : null;
	const voted = order.reduce((sum, id) => sum + (votes[id] ?? 0), 0);
	const rows: SummaryRow[] = order.map((id, index) => ({
		id,
		text: textOf(proposals, id),
		count: votes[id] ?? 0,
		percent: tally[id]?.percent ?? 0,
		leading: kind === 'open' && index === 0 && topCount > 0 && topCount > secondCount,
		winner: decisionId === id,
	}));

	return {
		kind,
		rows,
		voted,
		present,
		decisionText: decisionId ? textOf(proposals, decisionId) || null : null,
		mostAgreed: false,
		tie: kind === 'closed' && secondCount === topCount,
		showSupport: kind === 'closed',
		resultsHidden: false,
	};
}

/**
 * The summary while the results are closed to the class: the proposals in the
 * ratings order (never the vote order), zero counts, no leader, no winner, no
 * decision, no tie note, no support question. Only the turnout survives: it
 * is how many voted, not what they chose.
 */
function hiddenSummary(
	ballot: SummaryBallot,
	kind: SummaryKind,
	selections: Record<string, number> | undefined,
	proposals: readonly Statement[],
	present: number,
): VoteSummary {
	const order = orderBallot(
		ballot.candidateIds,
		'consensus',
		{ consensus: consensusOf(proposals), votes: {} },
		[],
		'',
	);
	const voted = Object.values(voteResults(ballot.candidateIds, selections)).reduce(
		(sum, result) => sum + result.count,
		0,
	);

	return {
		kind,
		rows: order.map((id) => ({
			id,
			text: textOf(proposals, id),
			count: 0,
			percent: 0,
			leading: false,
			winner: false,
		})),
		voted,
		present,
		decisionText: null,
		mostAgreed: false,
		tie: false,
		showSupport: false,
		resultsHidden: true,
	};
}

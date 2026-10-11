import { AgoraStage, type AgoraSession, type AgoraStagePlanItem } from '@freedi/shared-types';
import type { AgoraProposalScore } from '@freedi/shared-types';
import { councilBallot, councilPitch, type CouncilModel } from './villageCouncil';
import { villagePlace } from './villageRoute';

/**
 * What the 3D village is handed, built the same way for a student and for
 * the teacher's class view — so the two can never disagree about what the
 * council board shows or whose paper lies on which table.
 *
 * Pure: the callers read the listeners and pass the state in.
 */

/** A note as the world draws it on a table: text, whose it is, whether it has landed */
export interface VillagePaper {
	text: string;
	own: boolean;
	confirmed?: boolean;
}

/** The notes of an opened station, for the booths the walker is not standing at */
export interface StationPapers {
	itemId: string;
	place: string;
	papers: Array<{ text: string; own: boolean; author?: string }>;
}

/** The least a note needs to become a paper — `AgoraProposal` satisfies it */
export interface NoteLike {
	statementId: string;
	statement: string;
	creatorId: string;
	anonName?: string;
}

export interface CouncilModelInput {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	session: AgoraSession;
	/** The ballot's live tallies — read by the caller, who owns the listener */
	votes: {
		selections: Readonly<Record<string, number>>;
		myVoteStatementId: string | null;
		votedCount: number;
	};
	proposals: ReadonlyArray<NoteLike & { hidden?: boolean }>;
	scores: Readonly<Record<string, AgoraProposalScore>>;
	userId: string;
	classSize: number;
	leftLabel: string;
	rightLabel: string;
}

/**
 * What the council's wooden scoreboard shows: the class map while the room
 * writes and rates, the ballot with its bars once the vote is open, the
 * closed ballot after. It follows the ROOM's stage, not the one the player
 * stepped back to — the board stands in the village.
 */
export function councilModelFor(input: CouncilModelInput): CouncilModel {
	const roomStage = input.plan[input.currentIndex]?.stage;
	const atCouncil =
		roomStage === AgoraStage.voting ||
		roomStage === AgoraStage.results ||
		roomStage === AgoraStage.ended;
	if (atCouncil && input.session.voting) {
		return councilBallot({
			session: input.session,
			selections: input.votes.selections,
			myVoteStatementId: input.votes.myVoteStatementId,
			votedCount: input.votes.votedCount,
			classSize: input.classSize,
			closed: roomStage !== AgoraStage.voting,
		});
	}

	return councilPitch({
		proposals: input.proposals.filter((p) => !p.hidden),
		scores: input.scores,
		userId: input.userId,
		goalOnly: input.session.votingSettings?.goalZoneOnly === true,
		leftLabel: input.leftLabel,
		rightLabel: input.rightLabel,
		leadStatementId: input.session.classScore?.leadStatementId,
	});
}

/** The room on screen needs the council's own vote listener — the caller attaches it */
export function councilNeedsVotes(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
): boolean {
	return plan[currentIndex]?.stage === AgoraStage.voting;
}

/** The notes on the table the walker stands at */
export function papersFor(
	notes: readonly NoteLike[],
	userId: string,
	confirmedOf: (statementId: string) => boolean | undefined,
): VillagePaper[] {
	return notes.map((note) => ({
		text: note.statement,
		own: note.creatorId === userId,
		confirmed: confirmedOf(note.statementId),
	}));
}

/** Every opened station's notes, so the world can lay papers on tables the walker passes */
export function stationPapersFor(
	plan: readonly AgoraStagePlanItem[],
	currentIndex: number,
	notesOf: (item: AgoraStagePlanItem) => readonly NoteLike[],
	userId: string,
): StationPapers[] {
	return plan.slice(0, currentIndex + 1).map((item) => ({
		itemId: item.itemId,
		place: villagePlace(item),
		papers: notesOf(item).map((note) => ({
			text: note.statement,
			own: note.creatorId === userId,
			author: note.anonName,
		})),
	}));
}

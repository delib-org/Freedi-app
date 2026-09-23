import type { AgoraProposalScore, AgoraSession } from '@freedi/shared-types';
import { boardPercent, campLean, inBridgeZone, standings } from '../boardGeometry';

/**
 * What the council's scoreboard paints, as data.
 *
 * The 3D board is a canvas inside the village iframe and cannot read the
 * session; the shell sends it this model on every state sync. It is the
 * same reading the classic results board draws — same ranks, same goal
 * (`inBridgeZone`), same lead — flattened to numbers a canvas can plot, so
 * the wooden board at the council and the map on a phone never disagree.
 */

export interface CouncilPoint {
	rank: number;
	/** Class agreement, −100…100 — the vertical axis */
	percent: number;
	/** Which camp is behind it, −1…1 — the horizontal axis */
	lean: number;
	raters: number;
	mine: boolean;
	/** Standing in the goal */
	scored: boolean;
	lead: boolean;
	color: string;
	label: string;
	/** Nobody has rated it — it has no place on the field yet */
	unrated: boolean;
}

export interface CouncilBallotRow {
	number: number;
	label: string;
	votes: number;
	/** 0…1 of all votes cast */
	share: number;
	mine: boolean;
}

export interface CouncilModel {
	mode: 'pitch' | 'ballot';
	goalOnly: boolean;
	leftLabel: string;
	rightLabel: string;
	scoredAny: boolean;
	points: CouncilPoint[];
	footer: string;
	title?: string;
	candidates?: CouncilBallotRow[];
	showResults?: boolean;
}

/** One pastel per proposal number, so a point keeps its colour as ranks move */
const POINT_COLORS = [
	'#f4c95d',
	'#9fd3e6',
	'#e6a0a0',
	'#b7d9a3',
	'#d3b3e6',
	'#f0b787',
	'#a3c9d9',
	'#e2cc8f',
];

export interface CouncilPitchInput {
	proposals: ReadonlyArray<{ statementId: string; statement: string; creatorId: string }>;
	scores: Readonly<Record<string, AgoraProposalScore>>;
	userId?: string;
	/** The teacher narrowed the board to the goal */
	goalOnly: boolean;
	leftLabel: string;
	rightLabel: string;
	leadStatementId?: string;
}

/** The class map, for the council board: every rated proposal as a point */
export function councilPitch(input: CouncilPitchInput): CouncilModel {
	const ranked = standings(input.proposals, input.scores);
	const rankOf = new Map(ranked.map((entry) => [entry.statementId, entry.rank]));
	const lead =
		input.leadStatementId && rankOf.has(input.leadStatementId)
			? input.leadStatementId
			: (ranked[0]?.statementId ?? '');

	const points: CouncilPoint[] = input.proposals.map((proposal, index) => {
		const score = input.scores[proposal.statementId];
		const rated = score?.classConsensus !== undefined && score.classConsensus.n > 0;

		return {
			rank: rankOf.get(proposal.statementId) ?? input.proposals.length,
			percent: rated ? boardPercent(score) : 0,
			lean: rated && score ? campLean(score) : 0,
			raters: rated && score?.classConsensus ? score.classConsensus.n : 0,
			mine: proposal.creatorId === input.userId,
			scored: inBridgeZone(score),
			lead: proposal.statementId === lead,
			color: POINT_COLORS[index % POINT_COLORS.length],
			label: proposal.statement,
			unrated: !rated,
		};
	});
	const shown = input.goalOnly ? points.filter((point) => point.scored) : points;
	const rated = points.filter((point) => !point.unrated).length;
	const scoredCount = points.filter((point) => point.scored).length;
	const footer =
		rated === 0
			? 'עוד לא דורגו הצעות · לכו לביתן ודרגו את הפתקים של החברים'
			: scoredCount > 0
				? `${scoredCount} ${scoredCount === 1 ? 'הצעה' : 'הצעות'} בתוך השער · ${rated} מתוך ${points.length} דורגו`
				: `עדיין אין הצעה בתוך השער · ${rated} מתוך ${points.length} דורגו`;

	return {
		mode: 'pitch',
		goalOnly: input.goalOnly,
		leftLabel: input.leftLabel,
		rightLabel: input.rightLabel,
		scoredAny: scoredCount > 0,
		points: shown,
		footer,
	};
}

export interface CouncilBallotInput {
	session: AgoraSession;
	/** statementId → votes, as counted by the server */
	selections: Readonly<Record<string, number>>;
	myVoteStatementId: string | null;
	votedCount: number;
	classSize: number;
	/** The vote is over: the tallies are always shown */
	closed: boolean;
}

/** The ballot with its bars, for the council board during the vote */
export function councilBallot(input: CouncilBallotInput): CouncilModel {
	const candidates = input.session.voting?.candidates ?? [];
	const total = candidates.reduce(
		(sum, candidate) => sum + (input.selections[candidate.statementId] ?? 0),
		0,
	);
	const showResults = input.closed || input.session.votingSettings?.showResults === true;
	const rows: CouncilBallotRow[] = candidates.map((candidate, index) => {
		const votes = input.selections[candidate.statementId] ?? 0;

		return {
			number: index + 1,
			label: candidate.statement,
			votes,
			share: total > 0 ? votes / total : 0,
			mine: input.myVoteStatementId === candidate.statementId,
		};
	});
	// Same rule as the students' ballot: once the counts show, the board follows them.
	if (showResults && input.session.votingSettings?.liveReorder !== false) {
		rows.sort((a, b) => b.votes - a.votes || a.number - b.number);
	}

	return {
		mode: 'ballot',
		goalOnly: input.session.votingSettings?.goalZoneOnly === true,
		leftLabel: '',
		rightLabel: '',
		scoredAny: false,
		points: [],
		title: input.closed ? 'ההצבעה הסתיימה' : 'הצבעה · בחרו הצעה אחת',
		candidates: rows,
		showResults,
		footer:
			input.classSize > 0
				? `${input.votedCount} מתוך ${input.classSize} הצביעו${showResults ? '' : ' · התוצאות ייחשפו כשהמורה יחליט'}`
				: `${input.votedCount} הצביעו`,
	};
}

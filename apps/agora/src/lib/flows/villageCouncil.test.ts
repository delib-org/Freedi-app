import { describe, expect, it } from 'vitest';
import type { AgoraProposalScore, AgoraSession } from '@freedi/shared-types';
import { councilBallot, councilPitch } from './villageCouncil';

function score(
	id: string,
	consensus: number,
	n: number,
	left: number,
	right: number,
): AgoraProposalScore {
	const camp = (strong: number) => ({
		studentDist: [0, 0, 0, 0, strong] as [number, number, number, number, number],
		sum: strong,
		n: strong,
	});

	return {
		statementId: id,
		sessionId: 's',
		authorCamp: 'left',
		perCamp: { left: camp(left), right: camp(right), center: camp(0) },
		bridgingScore: 0,
		classConsensus: {
			consensus,
			n,
			eligible: 6,
			mean: consensus,
			coverage: n / 6,
			polarization: 0,
		},
		lastUpdate: 1,
	} as unknown as AgoraProposalScore;
}

const proposals = [
	{ statementId: 'a', statement: 'A', creatorId: 'me' },
	{ statementId: 'b', statement: 'B', creatorId: 'x' },
	{ statementId: 'c', statement: 'C', creatorId: 'y' },
];
const scores = {
	a: score('a', 0.6, 5, 3, 3),
	b: score('b', 0.3, 4, 4, 0),
};

describe('the council scoreboard model', () => {
	it('ranks the rated proposals, marks mine, the lead and the goal, and parks the unrated', () => {
		const model = councilPitch({
			proposals,
			scores,
			userId: 'me',
			goalOnly: false,
			leftLabel: 'L',
			rightLabel: 'R',
		});
		expect(model.mode).toBe('pitch');
		expect(
			model.points.map((p) => [p.rank, p.percent, p.mine, p.scored, p.lead, p.unrated]),
		).toEqual([
			[1, 60, true, true, true, false],
			[2, 30, false, false, false, false],
			[3, 0, false, false, false, true],
		]);
		expect(model.points[1].lean).toBe(-1);
		expect(model.scoredAny).toBe(true);
		expect(model.footer).toContain('1 הצעה בתוך השער');
	});
	it('narrows to the goal when the teacher asks, keeping the class rank', () => {
		const model = councilPitch({
			proposals,
			scores,
			userId: 'x',
			goalOnly: true,
			leftLabel: 'L',
			rightLabel: 'R',
		});
		expect(model.goalOnly).toBe(true);
		expect(model.points.map((p) => p.rank)).toEqual([1]);
	});
	it('says so when nothing was rated yet', () => {
		const model = councilPitch({
			proposals,
			scores: {},
			goalOnly: false,
			leftLabel: 'L',
			rightLabel: 'R',
		});
		expect(model.points.every((p) => p.unrated)).toBe(true);
		expect(model.footer).toContain('עוד לא דורגו');
	});
	it('turns the frozen ballot into bars, hidden until the teacher reveals them', () => {
		const session = {
			voting: {
				candidateIds: ['a', 'b'],
				candidates: [
					{ statementId: 'a', statement: 'A', consensus: 0.6 },
					{ statementId: 'b', statement: 'B', consensus: 0.3 },
				],
				computedAt: 1,
			},
			votingSettings: { goalZoneOnly: true },
		} as unknown as AgoraSession;
		const hidden = councilBallot({
			session,
			selections: { a: 3, b: 1 },
			myVoteStatementId: 'b',
			votedCount: 4,
			classSize: 6,
			closed: false,
		});
		expect(hidden.mode).toBe('ballot');
		expect(hidden.showResults).toBe(false);
		expect(hidden.candidates?.map((c) => [c.number, c.votes, c.share, c.mine])).toEqual([
			[1, 3, 0.75, false],
			[2, 1, 0.25, true],
		]);
		expect(hidden.footer).toContain('4 מתוך 6');
		const closed = councilBallot({
			session,
			selections: { a: 3, b: 1 },
			myVoteStatementId: null,
			votedCount: 4,
			classSize: 6,
			closed: true,
		});
		expect(closed.showResults).toBe(true);
		expect(closed.title).toBe('ההצבעה הסתיימה');
	});
	it('follows the counts once they show, unless the teacher switched reordering off', () => {
		const voting = {
			candidateIds: ['a', 'b', 'c'],
			candidates: [
				{ statementId: 'a', statement: 'A', consensus: 0.6 },
				{ statementId: 'b', statement: 'B', consensus: 0.4 },
				{ statementId: 'c', statement: 'C', consensus: 0.2 },
			],
			computedAt: 1,
		};
		const ballot = (votingSettings: Record<string, boolean>) =>
			councilBallot({
				session: { voting, votingSettings } as unknown as AgoraSession,
				selections: { a: 1, b: 0, c: 4 },
				myVoteStatementId: null,
				votedCount: 5,
				classSize: 5,
				closed: false,
			}).candidates?.map((c) => c.number);
		// Revealed, by default: the leader first, ties keep the ballot order.
		expect(ballot({ showResults: true })).toEqual([3, 1, 2]);
		// The teacher turned reordering off: the ballot keeps its own order.
		expect(ballot({ showResults: true, liveReorder: false })).toEqual([1, 2, 3]);
		// Hidden counts never move the ballot — the order would leak them.
		expect(ballot({})).toEqual([1, 2, 3]);
	});
});

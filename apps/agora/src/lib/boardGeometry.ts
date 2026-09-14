import {
	BRIDGE_ZONE,
	backing,
	boardPercent,
	campLean,
	inBridgeZone,
	type AgoraProposalScore,
} from '@freedi/shared-types';

/**
 * Where a proposal sits on the class map, as arithmetic rather than as CSS.
 *
 * The geometry itself (the goal box, the two axes) lives in shared-types
 * (`agoraGoal.ts`) so the server can draw the ballot from the same net the
 * board paints — see `VotingStageSettings.goalZoneOnly`. This module keeps
 * the app-side helpers built on it.
 */
export { BRIDGE_ZONE, backing, boardPercent, campLean, inBridgeZone };

/**
 * Every rated proposal's standing, best first — the same ordering the map's
 * rank badges use (standard competition ranking, ties share a rank).
 */
export function standings(
	proposals: ReadonlyArray<{ statementId: string }>,
	scores: Readonly<Record<string, AgoraProposalScore>>,
): Array<{ statementId: string; percent: number; rank: number }> {
	const rated = proposals
		.filter((proposal) => scores[proposal.statementId]?.classConsensus)
		.map((proposal) => ({
			statementId: proposal.statementId,
			percent: boardPercent(scores[proposal.statementId]),
			rank: 0,
		}))
		.sort((a, b) => b.percent - a.percent);

	rated.forEach((entry, index) => {
		const previous = rated[index - 1];
		entry.rank = previous && previous.percent === entry.percent ? previous.rank : index + 1;
	});

	return rated;
}

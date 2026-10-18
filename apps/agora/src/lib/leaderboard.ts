/**
 * The class points board, decided away from the component that draws it:
 * ranking, ties, the class total and each student's strongest role are
 * plain arithmetic over participant docs, so they are tested in node.
 *
 * Nothing here mints points. The totals are the game's own ledger
 * (`AgoraParticipant.points`, server-written); this module only ORDERS it.
 */
import type { AgoraParticipant, AgoraPoints } from '@freedi/shared-types';

/** Ranks that wear a medal — the same three the proposal board crowns */
export const LEADERBOARD_PODIUM_SIZE = 3;

/**
 * The six ways a student can have earned, in the order ties are broken:
 * the collaborative ones first, so a student who both helped and wrote is
 * named a helper — the lesson pays for that as much as for writing.
 */
export const POINT_ROLES = [
	'helping',
	'rating',
	'revising',
	'appreciation',
	'proposals',
	'valueAccuracy',
] as const;

export type PointRole = (typeof POINT_ROLES)[number];

export interface LeaderboardRow {
	participant: AgoraParticipant;
	/** `points.total` — the game's own balance, penalties already taken */
	points: number;
	/** Standard competition rank: ties share it, the rank below is skipped */
	rank: number;
	isMine: boolean;
	/** The category this student earned most in; absent at zero */
	role?: PointRole;
}

/** How much of `points` each role column holds — legacy docs lack some columns */
function roleValue(points: AgoraPoints, role: PointRole): number {
	return points[role] ?? 0;
}

/**
 * The category a student earned most in — their identity on the board. A
 * strict `>` with the collaborative roles first means a tie goes to the
 * role listed earlier; nothing is returned when nothing was earned.
 */
export function strongestRole(points: AgoraPoints): PointRole | undefined {
	let best: PointRole | undefined;
	let bestValue = 0;
	for (const role of POINT_ROLES) {
		const value = roleValue(points, role);
		if (value > bestValue) {
			best = role;
			bestValue = value;
		}
	}

	return best;
}

/**
 * Everyone in the class, in points order.
 *
 * Sorted by total, then by `joinedAt` so the list never reshuffles itself
 * between redraws. Standard competition ranking: two students on the same
 * total are BOTH 2nd and nothing is 3rd — numbering them 2 and 3 on the
 * strength of a sort order would invent a difference the game never paid.
 */
export function buildLeaderboard(
	participants: readonly AgoraParticipant[],
	userId?: string,
): LeaderboardRow[] {
	const rows: LeaderboardRow[] = [...participants]
		.filter((participant) => !participant.isAI)
		.sort((a, b) => b.points.total - a.points.total || a.joinedAt - b.joinedAt)
		.map((participant) => ({
			participant,
			points: participant.points.total,
			rank: 0,
			isMine: participant.userId === userId,
			role: strongestRole(participant.points),
		}));

	rows.forEach((row, index) => {
		const previous = rows[index - 1];
		row.rank = previous !== undefined && previous.points === row.points ? previous.rank : index + 1;
	});

	return rows;
}

/** The number that belongs to the whole class — every balance, added up */
export function classPointsTotal(rows: readonly LeaderboardRow[]): number {
	return rows.reduce((sum, row) => sum + row.points, 0);
}

/** A medal is for a podium rank that was actually earned, never for zero */
export function wearsMedal(row: LeaderboardRow): boolean {
	return row.rank <= LEADERBOARD_PODIUM_SIZE && row.points > 0;
}

/**
 * The podium: the first three rows that earned anything. Ties can put two
 * students on the same step — the rank they carry says so, the step order
 * is just the sort order.
 */
export function podiumRows(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
	return rows.filter((row) => wearsMedal(row)).slice(0, LEADERBOARD_PODIUM_SIZE);
}

import type { ClassTable, Statement } from '@freedi/shared-types';
import { allProposalsPool } from './allProposalsBoard';

/**
 * What the teacher console and the projector say at "כל ההצעות" (IA 19.5,
 * 19.6). Pure: the console feeds it the ratings listener (who rated what), the
 * projector only the options' aggregate counts. No per-student data reaches
 * the projector.
 */

/** Evaluator uid -> the proposal ids that student rated. */
export type RatingsByStudent = ReadonlyMap<string, ReadonlySet<string>>;

export interface RatedAllLine {
	/** Students who rated every proposal in their pool. */
	n: number;
	/** Students counted. */
	m: number;
}

/** Whether `uid` has rated every proposal they may rate (their own is not theirs to rate). */
export function ratedEverything(
	uid: string,
	options: readonly Statement[],
	challengeId: string | null,
	ratings: RatingsByStudent,
): boolean {
	const pool = allProposalsPool(options, challengeId, uid);
	if (pool.length === 0) return false;
	const mine = ratings.get(uid);

	return !!mine && pool.every((p) => mine.has(p.statementId));
}

/** "n of m students rated everything", over the given students. */
export function ratedAllLine(
	uids: readonly string[],
	options: readonly Statement[],
	challengeId: string | null,
	ratings: RatingsByStudent,
): RatedAllLine {
	const n = uids.filter((uid) => ratedEverything(uid, options, challengeId, ratings)).length;

	return { n, m: uids.length };
}

/** The table's line: its seated students with a device. */
export function tableRatedLine(
	table: ClassTable,
	options: readonly Statement[],
	challengeId: string | null,
	ratings: RatingsByStudent,
): RatedAllLine {
	return ratedAllLine(table.memberUids, options, challengeId, ratings);
}

/** "every proposal has at least k ratings": the fewest evaluators on any visible proposal. */
export function minRatingsPerProposal(proposals: readonly Statement[]): number {
	const counts = proposals
		.filter((p) => p.hide !== true)
		.map((p) => p.evaluation?.numberOfEvaluators ?? 0);

	return counts.length === 0 ? 0 : Math.min(...counts);
}

/** Evaluation docs to the per-student map (only proposals under the challenge are passed in). */
export function ratingsByStudent(
	docs: readonly { evaluatorId: string; statementId: string }[],
): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const d of docs) {
		const set = map.get(d.evaluatorId) ?? new Set<string>();
		set.add(d.statementId);
		map.set(d.evaluatorId, set);
	}

	return map;
}

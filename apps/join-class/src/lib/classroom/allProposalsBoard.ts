import type { Statement } from '@freedi/shared-types';
import { listableItems } from './c3Logic';

/**
 * The phone's board at "כל ההצעות" (IA 19.1, 19.4), as pure state. The board
 * is every proposal served to this phone in this step, batch after batch.
 * Rated cards stay on it. A batch is never added to: a proposal that arrives
 * mid-step waits in the pool for the next one. The board is view state, not
 * stored: a reload rebuilds it from the rated items plus a fresh open batch.
 */

export interface BoardBatch {
	ids: string[];
	/** Served while the student watched: the cards animate in and the phone scrolls to them. */
	live: boolean;
}

export interface Board {
	batches: BoardBatch[];
}

/** Picks the next batch out of the not-yet-served pool (the Thompson sampler). */
export type BatchSampler = (candidates: readonly Statement[]) => Statement[];

/** Whether this phone has rated a proposal (a tap in flight counts). */
export type IsRated = (statementId: string) => boolean;

/** The pool: visible proposals under the challenge, minus the student's own (IA 19.1). */
export function allProposalsPool(
	options: readonly Statement[],
	challengeId: string | null,
	uid: string,
): Statement[] {
	if (!challengeId) return [];

	return listableItems(
		options.filter((o) => o.parentId === challengeId),
		{ uid, tableId: null, challengeId },
	);
}

function byCreation(a: Statement, b: Statement): number {
	return (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.statementId.localeCompare(b.statementId);
}

export function servedIds(board: Board): Set<string> {
	return new Set(board.batches.flatMap((batch) => batch.ids));
}

/**
 * The board on entering the step (or after a reload): what this phone already
 * rated, oldest first, then one sampled batch of what it has not.
 */
export function startBoard(
	pool: readonly Statement[],
	isRated: IsRated,
	sample: BatchSampler,
): Board {
	const rated = pool.filter((p) => isRated(p.statementId)).sort(byCreation);
	const open = sample(pool.filter((p) => !isRated(p.statementId)));
	const batches: BoardBatch[] = [];
	if (rated.length > 0) batches.push({ ids: rated.map((p) => p.statementId), live: false });
	if (open.length > 0) batches.push({ ids: open.map((p) => p.statementId), live: false });

	return { batches };
}

/** Each batch's cards that are still in the pool (a hidden or deleted proposal leaves the board). */
export function boardCards(board: Board, pool: readonly Statement[]): Statement[][] {
	const byId = new Map(pool.map((p) => [p.statementId, p]));

	return board.batches.map((batch) =>
		batch.ids.map((id) => byId.get(id)).filter((p): p is Statement => p !== undefined),
	);
}

function unserved(board: Board, pool: readonly Statement[]): Statement[] {
	const served = servedIds(board);

	return pool.filter((p) => !served.has(p.statementId));
}

/** True when every card on the board is rated and the pool still holds proposals not served. */
export function needsNextBatch(
	board: Board,
	pool: readonly Statement[],
	isRated: IsRated,
): boolean {
	const onBoard = boardCards(board, pool).flat();

	return onBoard.every((p) => isRated(p.statementId)) && unserved(board, pool).length > 0;
}

/** The board with the next batch appended (served live). Unchanged when nothing is left. */
export function serveNextBatch(
	board: Board,
	pool: readonly Statement[],
	sample: BatchSampler,
): Board {
	const next = sample(unserved(board, pool));
	if (next.length === 0) return board;

	return { batches: [...board.batches, { ids: next.map((p) => p.statementId), live: true }] };
}

export interface BoardProgress {
	rated: number;
	total: number;
}

/** "You rated n of m": over the whole pool, not only the board. */
export function boardProgress(pool: readonly Statement[], isRated: IsRated): BoardProgress {
	return { rated: pool.filter((p) => isRated(p.statementId)).length, total: pool.length };
}

/** Every proposal in the pool is served and rated. */
export function isBoardDone(board: Board, pool: readonly Statement[], isRated: IsRated): boolean {
	return (
		pool.length > 0 &&
		unserved(board, pool).length === 0 &&
		pool.every((p) => isRated(p.statementId))
	);
}

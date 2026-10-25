import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	allProposalsPool,
	boardCards,
	boardProgress,
	isBoardDone,
	needsNextBatch,
	serveNextBatch,
	servedIds,
	startBoard,
	type BatchSampler,
	type Board,
} from '../allProposalsBoard';
import {
	minRatingsPerProposal,
	ratedAllLine,
	ratedEverything,
	ratingsByStudent,
	tableRatedLine,
} from '../allProposalsConsole';

const CH = 'challenge';

function p(id: string, extra: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: id,
		parentId: CH,
		creatorId: `author-${id}`,
		createdAt: Number(id.replace(/\D/g, '')) || 0,
		...extra,
	} as Statement;
}

/** A sampler that takes the first `size` in the given order (the real one is tested on its own). */
const firstN =
	(size = 6): BatchSampler =>
	(candidates) =>
		candidates.slice(0, size);

function ratedSet(ids: string[]): (id: string) => boolean {
	const set = new Set(ids);

	return (id) => set.has(id);
}

const pool = (n: number): Statement[] => Array.from({ length: n }, (_, i) => p(`p${i + 1}`));

describe('allProposalsPool', () => {
	it('keeps visible proposals under the challenge, minus the student own and co-authored ones', () => {
		const options = [
			p('p1'),
			p('p2', { creatorId: 'me' }),
			p('p3', { hide: true }),
			p('p4', { parentId: 'guiding' }),
			p('p5', { classTable: { tableId: 't--1', shared: false, coAuthors: ['me'] } }),
			p('p6', { classTable: { tableId: 't--1', shared: false, coAuthors: [] } }),
		];
		expect(allProposalsPool(options, CH, 'me').map((x) => x.statementId)).toEqual(['p1', 'p6']);
	});

	it('is empty without a challenge', () => {
		expect(allProposalsPool([p('p1')], null, 'me')).toEqual([]);
	});
});

describe('the board', () => {
	it('starts with one batch of six out of a larger pool', () => {
		const board = startBoard(pool(10), ratedSet([]), firstN());
		expect(board.batches).toHaveLength(1);
		expect(board.batches[0].ids).toHaveLength(6);
		expect(board.batches[0].live).toBe(false);
	});

	it('shows all of a pool of six or fewer, with no second batch', () => {
		const items = pool(5);
		const board = startBoard(items, ratedSet([]), firstN());
		expect(board.batches).toHaveLength(1);
		expect(needsNextBatch(board, items, ratedSet(['p1']))).toBe(false);
	});

	it('serves the next batch only when every card on the board is rated', () => {
		const items = pool(9);
		const board = startBoard(items, ratedSet([]), firstN());
		expect(needsNextBatch(board, items, ratedSet(['p1', 'p2', 'p3', 'p4', 'p5']))).toBe(false);
		const allSix = ratedSet(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
		expect(needsNextBatch(board, items, allSix)).toBe(true);
		const next = serveNextBatch(board, items, firstN());
		expect(next.batches).toHaveLength(2);
		expect(next.batches[1]).toEqual({ ids: ['p7', 'p8', 'p9'], live: true });
	});

	it('keeps rated cards on the board after the next batch arrives', () => {
		const items = pool(8);
		const board = serveNextBatch(startBoard(items, ratedSet([]), firstN()), items, firstN());
		expect(
			boardCards(board, items)
				.flat()
				.map((x) => x.statementId),
		).toEqual(items.map((x) => x.statementId));
	});

	it('never adds a proposal that arrived mid-step to the open batch', () => {
		const items = pool(3);
		const board = startBoard(items, ratedSet([]), firstN());
		const grown = [...items, p('p4')];
		expect(boardCards(board, grown).flat()).toHaveLength(3);
		expect(needsNextBatch(board, grown, ratedSet(['p1', 'p2']))).toBe(false);
		expect(needsNextBatch(board, grown, ratedSet(['p1', 'p2', 'p3']))).toBe(true);
	});

	it('a reload rebuilds the board: rated items first, then a fresh open batch', () => {
		const items = pool(10);
		const board = startBoard(items, ratedSet(['p9', 'p2']), firstN());
		expect(board.batches[0]).toEqual({ ids: ['p2', 'p9'], live: false });
		expect(board.batches[1].ids).toEqual(['p1', 'p3', 'p4', 'p5', 'p6', 'p7']);
	});

	it('drops a proposal the teacher hid from the board', () => {
		const items = pool(3);
		const board = startBoard(items, ratedSet([]), firstN());
		expect(boardCards(board, items.slice(1)).flat()).toHaveLength(2);
	});

	it('serveNextBatch leaves the board unchanged when nothing is left', () => {
		const items = pool(2);
		const board = startBoard(items, ratedSet([]), firstN());
		expect(serveNextBatch(board, items, firstN())).toBe(board);
	});

	it('an empty pool starts empty; the first arrival is served as a batch', () => {
		const empty: Board = startBoard([], ratedSet([]), firstN());
		expect(empty.batches).toEqual([]);
		const items = pool(1);
		expect(needsNextBatch(empty, items, ratedSet([]))).toBe(true);
		expect(servedIds(serveNextBatch(empty, items, firstN()))).toEqual(new Set(['p1']));
	});

	it('counts progress over the pool and knows when the student is done', () => {
		const items = pool(7);
		let board = startBoard(items, ratedSet([]), firstN());
		const all = ratedSet(items.map((x) => x.statementId));
		expect(boardProgress(items, ratedSet(['p1', 'p2']))).toEqual({ rated: 2, total: 7 });
		expect(isBoardDone(board, items, all)).toBe(false);
		board = serveNextBatch(board, items, firstN());
		expect(isBoardDone(board, items, all)).toBe(true);
		expect(isBoardDone(startBoard([], all, firstN()), [], all)).toBe(false);
	});
});

describe('console and projector lines', () => {
	const options = [
		p('p1', { creatorId: 'a' }),
		p('p2', { creatorId: 'b' }),
		p('p3', { creatorId: 'c' }),
	];

	it('a student rated everything when every proposal but their own is rated', () => {
		const ratings = ratingsByStudent([
			{ evaluatorId: 'a', statementId: 'p2' },
			{ evaluatorId: 'a', statementId: 'p3' },
			{ evaluatorId: 'b', statementId: 'p1' },
		]);
		expect(ratedEverything('a', options, CH, ratings)).toBe(true);
		expect(ratedEverything('b', options, CH, ratings)).toBe(false);
		expect(ratedEverything('z', options, CH, ratings)).toBe(false);
		expect(ratedAllLine(['a', 'b', 'c'], options, CH, ratings)).toEqual({ n: 1, m: 3 });
	});

	it('a table line counts its seated students', () => {
		const ratings = ratingsByStudent([
			{ evaluatorId: 'a', statementId: 'p2' },
			{ evaluatorId: 'a', statementId: 'p3' },
		]);
		const table = { memberUids: ['a', 'b'] } as unknown as Parameters<typeof tableRatedLine>[0];
		expect(tableRatedLine(table, options, CH, ratings)).toEqual({ n: 1, m: 2 });
	});

	it('the fewest ratings on any visible proposal', () => {
		const rated = (id: string, n: number, hide = false): Statement =>
			p(id, {
				hide,
				evaluation: { numberOfEvaluators: n, sumEvaluations: 0, sumSquaredEvaluations: 0 },
			} as Partial<Statement>);
		expect(minRatingsPerProposal([rated('p1', 4), rated('p2', 2), rated('p3', 0, true)])).toBe(2);
		expect(minRatingsPerProposal([])).toBe(0);
		expect(minRatingsPerProposal([p('p1')])).toBe(0);
	});
});

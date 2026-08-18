import { describe, it, expect } from 'vitest';
import { resolveChallenge, seatOrder } from '@freedi/shared-types';

/**
 * The challenge maths. Lives here rather than in shared-types because agora's
 * vitest gate is the one that actually runs against the package — same reason
 * `votingSelection.test.ts` sits beside it.
 */

const BOARD = ['a', 'b', 'c'];
const NO_CONSENSUS: Record<string, number> = {};

describe('resolveChallenge', () => {
	it('seats a challenger that beats the weakest, and evicts that one', () => {
		const result = resolveChallenge({ a: 7, b: 5, c: 1, x: 4 }, BOARD, 'x', NO_CONSENSUS);

		expect(result.survived).toBe(true);
		expect(result.challengerVotes).toBe(4);
		expect(result.evictedStatementId).toBe('c');
		expect(result.boardIds).toEqual(['a', 'b', 'x']);
	});

	it('keeps the board at its size — one in, one out', () => {
		const result = resolveChallenge({ a: 7, b: 5, c: 1, x: 4 }, BOARD, 'x', NO_CONSENSUS);

		expect(result.boardIds).toHaveLength(BOARD.length);
	});

	it('refuses a challenger that merely TIES the weakest', () => {
		// The rule that will get argued about: a class that did not move keeps
		// the ballot it had.
		const result = resolveChallenge({ a: 7, b: 5, c: 3, x: 3 }, BOARD, 'x', NO_CONSENSUS);

		expect(result.survived).toBe(false);
		expect(result.evictedStatementId).toBeUndefined();
		expect(result.boardIds).toEqual(BOARD);
	});

	it('refuses a challenger that comes last outright', () => {
		const result = resolveChallenge({ a: 7, b: 5, c: 3, x: 1 }, BOARD, 'x', NO_CONSENSUS);

		expect(result.survived).toBe(false);
		expect(result.boardIds).toEqual(BOARD);
	});

	it('refuses a challenger nobody voted for', () => {
		const result = resolveChallenge({ a: 7, b: 5, c: 3 }, BOARD, 'x', NO_CONSENSUS);

		expect(result.survived).toBe(false);
		expect(result.challengerVotes).toBe(0);
	});

	it('refuses everything when the room did not vote at all', () => {
		// 0 is not strictly greater than 0, so the board survives untouched.
		const result = resolveChallenge({}, BOARD, 'x', NO_CONSENSUS);

		expect(result.survived).toBe(false);
		expect(result.boardIds).toEqual(BOARD);
	});

	it('breaks a tie at the bottom on consensus — the less agreed option falls', () => {
		const result = resolveChallenge({ a: 7, b: 1, c: 1, x: 4 }, BOARD, 'x', {
			a: 0.9,
			b: 0.6,
			c: 0.2,
		});

		expect(result.evictedStatementId).toBe('c');
		expect(result.boardIds).toEqual(['a', 'b', 'x']);
	});

	it('breaks a tie on statementId when votes AND consensus are equal', () => {
		// Deterministic rather than whatever order the query returned.
		const result = resolveChallenge({ a: 7, b: 1, c: 1, x: 4 }, BOARD, 'x', {
			a: 0.9,
			b: 0.5,
			c: 0.5,
		});

		expect(result.evictedStatementId).toBe('b');
	});

	it('seats a challenger unopposed when the board is empty', () => {
		// A class that rated nothing has no ballot; the first challenger simply
		// stands. No special case in the caller.
		const result = resolveChallenge({ x: 0 }, [], 'x', NO_CONSENSUS);

		expect(result.survived).toBe(true);
		expect(result.evictedStatementId).toBeUndefined();
		expect(result.boardIds).toEqual(['x']);
	});

	it('handles a board of one', () => {
		const survives = resolveChallenge({ a: 1, x: 2 }, ['a'], 'x', NO_CONSENSUS);
		expect(survives.boardIds).toEqual(['x']);
		expect(survives.evictedStatementId).toBe('a');

		const fails = resolveChallenge({ a: 2, x: 1 }, ['a'], 'x', NO_CONSENSUS);
		expect(fails.survived).toBe(false);
		expect(fails.boardIds).toEqual(['a']);
	});

	it('does not mutate the board it was given', () => {
		const board = ['a', 'b', 'c'];
		resolveChallenge({ a: 7, b: 5, c: 1, x: 4 }, board, 'x', NO_CONSENSUS);

		expect(board).toEqual(['a', 'b', 'c']);
	});
});

describe('seatOrder', () => {
	it('orders by arrival and drops the bots', () => {
		const order = seatOrder([
			{ userId: 'u3', anonName: 'Gamma', joinedAt: 300 },
			{ userId: 'bot', anonName: 'Bot', joinedAt: 50, isAI: true },
			{ userId: 'u1', anonName: 'Alpha', joinedAt: 100 },
			{ userId: 'u2', anonName: 'Beta', joinedAt: 200 },
		]);

		expect(order).toEqual([
			{ userId: 'u1', anonName: 'Alpha' },
			{ userId: 'u2', anonName: 'Beta' },
			{ userId: 'u3', anonName: 'Gamma' },
		]);
	});

	it('does not mutate its input', () => {
		const participants = [
			{ userId: 'u2', anonName: 'Beta', joinedAt: 200 },
			{ userId: 'u1', anonName: 'Alpha', joinedAt: 100 },
		];
		seatOrder(participants);

		expect(participants[0].userId).toBe('u2');
	});

	it('returns nothing for a room of bots', () => {
		expect(seatOrder([{ userId: 'bot', anonName: 'Bot', joinedAt: 1, isAI: true }])).toEqual([]);
	});
});

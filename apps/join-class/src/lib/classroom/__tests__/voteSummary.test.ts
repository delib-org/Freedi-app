import { describe, expect, it } from 'vitest';
import type { Statement, StatementSubscription } from '@freedi/shared-types';
import type { SummaryInput } from '../voteSummary';
import { everyoneVoted, presentCount, summaryOf as summaryWith } from '../voteSummary';

/** The summary the class sees once the teacher opened the results; the closed one is tested below. */
const summaryOf = (input: SummaryInput) => summaryWith({ resultsShown: true, ...input });

function option(statementId: string, consensus?: number, hide?: boolean): Statement {
	return { statementId, statement: `text ${statementId}`, consensus, hide } as unknown as Statement;
}

const proposals = [option('a', 0.2), option('b', 0.8), option('c', 0.5), option('h', 0.99, true)];
const candidateIds = ['a', 'b', 'c'];

describe('summaryOf', () => {
	it('none: no vote held, the most agreed visible proposal is the decision', () => {
		const summary = summaryOf({ ballot: null, selections: undefined, proposals, present: 5 });
		expect(summary.kind).toBe('none');
		expect(summary.decisionText).toBe('text b');
		expect(summary.mostAgreed).toBe(true);
		expect(summary.showSupport).toBe(true);
		expect(summary.rows).toEqual([]);
	});

	it('none without proposals: no decision, no support question', () => {
		const summary = summaryOf({ ballot: null, selections: undefined, proposals: [], present: 5 });
		expect(summary.decisionText).toBeNull();
		expect(summary.showSupport).toBe(false);
	});

	it('open: live votes, one leader, no decision, support hidden', () => {
		const summary = summaryOf({
			ballot: { candidateIds },
			selections: { a: 1, c: 3 },
			proposals,
			present: 6,
		});
		expect(summary.kind).toBe('open');
		expect(summary.rows.map((r) => r.id)).toEqual(['c', 'a', 'b']);
		expect(summary.rows.filter((r) => r.leading).map((r) => r.id)).toEqual(['c']);
		expect(summary.voted).toBe(4);
		expect(summary.decisionText).toBeNull();
		expect(summary.showSupport).toBe(false);
	});

	it('open: nobody leads on a tie or before the first vote', () => {
		const tied = summaryOf({
			ballot: { candidateIds },
			selections: { a: 2, c: 2 },
			proposals,
			present: 6,
		});
		expect(tied.rows.some((r) => r.leading)).toBe(false);
		const empty = summaryOf({ ballot: { candidateIds }, selections: {}, proposals, present: 6 });
		expect(empty.rows.some((r) => r.leading)).toBe(false);
	});

	it('paused: the same tally, nothing leading', () => {
		const summary = summaryOf({
			ballot: { candidateIds, pausedAt: 5 },
			selections: { a: 3 },
			proposals,
			present: 3,
		});
		expect(summary.kind).toBe('paused');
		expect(summary.rows.some((r) => r.leading)).toBe(false);
		expect(summary.showSupport).toBe(false);
	});

	it('closed: winner first, turnout, support shown', () => {
		const summary = summaryOf({
			ballot: { candidateIds, closedAt: 9, decisionId: 'a' },
			selections: { a: 3, b: 1 },
			proposals,
			present: 5,
		});
		expect(summary.kind).toBe('closed');
		expect(summary.rows[0]).toMatchObject({ id: 'a', winner: true, count: 3, percent: 75 });
		expect(summary.decisionText).toBe('text a');
		expect(summary.tie).toBe(false);
		expect(summary.showSupport).toBe(true);
		expect(summary.voted).toBe(4);
	});

	it('a decision with no closedAt (old doc) still reads as closed', () => {
		const summary = summaryOf({
			ballot: { candidateIds, decisionId: 'c' },
			selections: {},
			proposals,
			present: 2,
		});
		expect(summary.kind).toBe('closed');
		expect(summary.decisionText).toBe('text c');
	});

	it('closed on a tie of votes: the ratings (C_p) decide, and it says so', () => {
		const summary = summaryOf({
			ballot: { candidateIds, closedAt: 9, decisionId: 'b' },
			selections: { a: 2, b: 2 },
			proposals,
			present: 4,
		});
		expect(summary.tie).toBe(true);
		expect(summary.rows[0].id).toBe('b');
	});
});

describe('presentCount and everyoneVoted', () => {
	it('counts students, not the teacher', () => {
		const roster = [{ userId: 't' }, { userId: 's1' }, { userId: 's2' }] as StatementSubscription[];
		expect(presentCount(roster, 't')).toBe(2);
	});

	it('is true only when someone is present and all voted', () => {
		expect(everyoneVoted(0, 0)).toBe(false);
		expect(everyoneVoted(2, 3)).toBe(false);
		expect(everyoneVoted(3, 3)).toBe(true);
	});
});

describe('summaryOf with the results closed (the default)', () => {
	const selections = { a: 1, b: 5, c: 2 };
	const closedBallot = { candidateIds, closedAt: 10, decisionId: 'b' };

	it('is the closed summary unless resultsShown is true', () => {
		const left = summaryWith({ ballot: closedBallot, selections, proposals, present: 8 });
		const off = summaryWith({
			ballot: closedBallot,
			selections,
			proposals,
			present: 8,
			resultsShown: false,
		});
		expect(left).toEqual(off);
		expect(left.resultsHidden).toBe(true);
	});

	it.each([
		['open', { candidateIds }],
		['paused', { candidateIds, pausedAt: 5 }],
		['closed', closedBallot],
	])('%s: no counts, no winner, no leader, no decision, no tie, no support', (_name, ballot) => {
		const summary = summaryWith({ ballot, selections, proposals, present: 8 });
		expect(summary.resultsHidden).toBe(true);
		expect(summary.decisionText).toBeNull();
		expect(summary.tie).toBe(false);
		expect(summary.showSupport).toBe(false);
		expect(summary.rows.every((r) => r.count === 0 && r.percent === 0)).toBe(true);
		expect(summary.rows.some((r) => r.winner || r.leading)).toBe(false);
	});

	it('lists the proposals in the ratings order, never the vote order', () => {
		const summary = summaryWith({ ballot: closedBallot, selections, proposals, present: 8 });
		// votes would put b, c, a; the ratings (C_p) put b, c, a too, so use a case that differs
		const flipped = summaryWith({
			ballot: closedBallot,
			selections: { a: 9, b: 0, c: 0 },
			proposals,
			present: 8,
		});
		expect(summary.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
		expect(flipped.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
	});

	it('keeps the turnout (how many voted, not what)', () => {
		const summary = summaryWith({ ballot: closedBallot, selections, proposals, present: 8 });
		expect(summary.voted).toBe(8);
		expect(summary.present).toBe(8);
	});

	it('no vote held: nothing is hidden, the decision is the most agreed proposal', () => {
		const summary = summaryWith({ ballot: null, selections: undefined, proposals, present: 8 });
		expect(summary.resultsHidden).toBe(false);
		expect(summary.decisionText).toBe('text b');
	});
});

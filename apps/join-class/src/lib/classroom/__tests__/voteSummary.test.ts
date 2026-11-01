import { describe, expect, it } from 'vitest';
import type { Statement, StatementSubscription } from '@freedi/shared-types';
import { everyoneVoted, presentCount, summaryOf } from '../voteSummary';

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

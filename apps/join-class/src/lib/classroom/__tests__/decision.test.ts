import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { decisionOf, decisionVisibleToClass, showsDecision } from '../decision';
import type { DecisionInput } from '../decision';
import { summaryOf } from '../voteSummary';

function proposal(id: string, text: string, consensus = 0.5): Statement {
	return { statementId: id, statement: text, consensus } as unknown as Statement;
}

const PROPOSALS = [
	proposal('a', 'Phones stay in the bag', 0.7),
	proposal('b', 'A phone box in class', 0.5),
	proposal('c', 'Each class decides', 0.3),
	proposal('d', 'No rule', 0.2),
];

function input(patch: Partial<DecisionInput> = {}): DecisionInput {
	return {
		ballot: { candidateIds: ['a', 'b', 'c', 'd'], closedAt: 10 },
		selections: undefined,
		proposals: PROPOSALS,
		present: 26,
		resultsShown: false,
		...patch,
	};
}

/** Votes per proposal as the `selections` map the engine writes: voter id -> proposal id. */
function votes(counts: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [id, n] of Object.entries(counts)) out[id] = n;

	return out;
}

describe('decisionOf', () => {
	it('names the same winner as the summary the projector and the phones draw', () => {
		const selections = votes({ a: 14, b: 6, c: 4 });
		const decision = decisionOf(input({ selections, resultsShown: true }));
		const summary = summaryOf({
			ballot: input().ballot,
			selections,
			proposals: PROPOSALS,
			present: 26,
			resultsShown: true,
		});
		expect(decision.kind).toBe('decided');
		expect(decision.text).toBe(summary.decisionText);
		expect(decision.top[0].id).toBe(summary.rows.find((row) => row.winner)?.id);
	});

	it('the teacher sees the decision even while the results are closed to the class', () => {
		const selections = votes({ a: 14, b: 6, c: 4 });
		const hidden = decisionOf(input({ selections, resultsShown: false }));
		const shown = decisionOf(input({ selections, resultsShown: true }));
		expect(hidden.text).toBe(shown.text);
		expect(hidden.text).not.toBeNull();
		expect(hidden.sharedWithClass).toBe(false);
		expect(shown.sharedWithClass).toBe(true);
	});

	it('gives the winner a percent and a vote count, and at most three rows', () => {
		const decision = decisionOf(input({ selections: votes({ a: 14, b: 6, c: 4, d: 2 }) }));
		expect(decision.votes).toBe(decision.top[0].count);
		expect(decision.percent).toBe(decision.top[0].percent);
		expect(decision.top.length).toBeLessThanOrEqual(3);
		expect(decision.voted).toBe(26);
		expect(decision.present).toBe(26);
	});

	it('no vote held: the most agreed proposal, flagged as such, with no percent', () => {
		const decision = decisionOf(input({ ballot: null }));
		expect(decision.kind).toBe('none');
		expect(decision.mostAgreed).toBe(true);
		expect(decision.text).toBe('Phones stay in the bag');
		expect(decision.percent).toBeNull();
		expect(decision.votes).toBeNull();
		expect(decision.top).toEqual([]);
	});

	it('a vote still open has no decision text and no winner', () => {
		const decision = decisionOf(
			input({ ballot: { candidateIds: ['a', 'b'] }, selections: votes({ a: 3, b: 1 }) }),
		);
		expect(decision.kind).toBe('open');
		expect(decision.text).toBeNull();
		expect(decision.percent).toBeNull();
	});

	it('a paused vote is paused, not decided', () => {
		const decision = decisionOf(input({ ballot: { candidateIds: ['a', 'b'], pausedAt: 5 } }));
		expect(decision.kind).toBe('paused');
	});

	it('a tie is said (the ratings decided)', () => {
		const decision = decisionOf(input({ selections: votes({ a: 5, b: 5 }) }));
		expect(decision.kind).toBe('decided');
		expect(decision.tie).toBe(true);
	});
});

describe('decisionVisibleToClass: the projector and phone rule', () => {
	it('draws a decision only when there is one and its results are open', () => {
		expect(decisionVisibleToClass({ kind: 'closed', resultsHidden: false })).toBe(true);
		expect(decisionVisibleToClass({ kind: 'none', resultsHidden: false })).toBe(true);
		expect(decisionVisibleToClass({ kind: 'closed', resultsHidden: true })).toBe(false);
		expect(decisionVisibleToClass({ kind: 'open', resultsHidden: false })).toBe(false);
		expect(decisionVisibleToClass({ kind: 'paused', resultsHidden: false })).toBe(false);
	});
});

describe('showsDecision: where the console draws it', () => {
	it('at Vote only once the vote has closed', () => {
		expect(showsDecision({ stepKey: 'vote', status: 'live', ballotClosed: false })).toBe(false);
		expect(showsDecision({ stepKey: 'vote', status: 'live', ballotClosed: true })).toBe(true);
	});

	it('at Summary, and in an open or ended lesson whatever the step', () => {
		expect(showsDecision({ stepKey: 'summary', status: 'live', ballotClosed: false })).toBe(true);
		expect(showsDecision({ stepKey: 'summary', status: 'ended', ballotClosed: true })).toBe(true);
		expect(showsDecision({ stepKey: 'tables', status: 'open', ballotClosed: false })).toBe(true);
		expect(showsDecision({ stepKey: 'tables', status: 'ended', ballotClosed: false })).toBe(true);
	});

	it('not before the vote, and not while paused mid-lesson', () => {
		expect(showsDecision({ stepKey: 'proposals', status: 'live', ballotClosed: false })).toBe(
			false,
		);
		expect(showsDecision({ stepKey: 'proposals', status: 'paused', ballotClosed: false })).toBe(
			false,
		);
	});
});

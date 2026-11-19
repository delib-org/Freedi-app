import { describe, expect, it } from 'vitest';
import type { LessonStepKey } from '@freedi/shared-types';
import { hasStepMore, stepMoreContent } from '../stepMore';
import type { StepMoreInput } from '../stepMore';

function at(stepKey: LessonStepKey, patch: Partial<StepMoreInput> = {}): StepMoreInput {
	return {
		status: 'live',
		stepKey,
		hasTables: true,
		hasChallenge: true,
		connected: false,
		canUpdateFromRegistration: false,
		ballotFrozen: false,
		ballotClosed: false,
		...patch,
	};
}

describe('the step menu is not drawn where there is nothing in it', () => {
	it.each(['waiting', 'opening', 'side', 'allProposals'] as const)('%s', (key) => {
		expect(hasStepMore(at(key))).toBe(false);
		expect(stepMoreContent(at(key))).toEqual({ items: [], danger: [] });
	});

	it.each(['ended', 'open'] as const)('a %s lesson has none', (status) => {
		for (const key of ['tables', 'proposals', 'vote', 'summary'] as const) {
			expect(hasStepMore(at(key, { status }))).toBe(false);
		}
	});

	it('a paused lesson keeps the step menu (its actions are held, the resets stay)', () => {
		expect(hasStepMore(at('vote', { status: 'paused' }))).toBe(true);
	});
});

describe('Dividing into tables', () => {
	it('seats per table, and divide again as the one red item once there are tables', () => {
		expect(stepMoreContent(at('tables'))).toEqual({ items: ['seats'], danger: ['resplit'] });
		expect(stepMoreContent(at('tables', { hasTables: false }))).toEqual({
			items: ['seats'],
			danger: [],
		});
	});

	it('a connected lesson takes its tables from the registration: no divide again', () => {
		expect(stepMoreContent(at('tables', { connected: true }))).toEqual({
			items: ['manageRegistration'],
			danger: [],
		});
		expect(
			stepMoreContent(at('tables', { connected: true, canUpdateFromRegistration: true })),
		).toEqual({ items: ['updateFromRegistration', 'manageRegistration'], danger: [] });
	});
});

describe('Investigation questions and Proposals', () => {
	it('Investigation questions: only the red reset of every table, and only with tables', () => {
		expect(stepMoreContent(at('tableTalk'))).toEqual({ items: [], danger: ['resetTurns'] });
		expect(hasStepMore(at('tableTalk', { hasTables: false }))).toBe(false);
	});

	it('Proposals: all tables to rate, another turn, everyone together; nothing red', () => {
		expect(stepMoreContent(at('proposals'))).toEqual({
			items: ['allTablesRate', 'anotherTurnAll', 'plenum'],
			danger: [],
		});
	});
});

describe('Vote', () => {
	it('before it opens: which proposals, order, who sees, and the skip', () => {
		expect(stepMoreContent(at('vote'))).toEqual({
			items: ['voteScope', 'voteOrder', 'resultsAudience', 'skipVote'],
			danger: [],
		});
	});

	it('open: pause, order, who sees, the scope read-only; reset is red and last', () => {
		expect(stepMoreContent(at('vote', { ballotFrozen: true }))).toEqual({
			items: ['pauseVote', 'voteOrder', 'resultsAudience', 'voteScopeLocked'],
			danger: ['resetVote'],
		});
	});

	it('closed: order, who sees; reset stays', () => {
		expect(stepMoreContent(at('vote', { ballotFrozen: true, ballotClosed: true }))).toEqual({
			items: ['voteOrder', 'resultsAudience'],
			danger: ['resetVote'],
		});
	});

	it('the skip exists only before the vote opens', () => {
		const items = (patch: Partial<StepMoreInput>): readonly string[] =>
			stepMoreContent(at('vote', patch)).items;
		expect(items({})).toContain('skipVote');
		expect(items({ ballotFrozen: true })).not.toContain('skipVote');
		expect(items({ ballotFrozen: true, ballotClosed: true })).not.toContain('skipVote');
	});

	it('every red item is last by construction', () => {
		for (const key of ['tables', 'tableTalk', 'vote'] as const) {
			const content = stepMoreContent(at(key, { ballotFrozen: true }));
			expect(
				content.items.every((item) => !['resplit', 'resetTurns', 'resetVote'].includes(item)),
			).toBe(true);
		}
	});

	it('no question to solve: nothing to set', () => {
		expect(hasStepMore(at('vote', { hasChallenge: false }))).toBe(false);
	});
});

describe('Summary', () => {
	it('who sees the results and who sees the support by side', () => {
		expect(stepMoreContent(at('summary'))).toEqual({
			items: ['resultsAudience', 'supportAudience'],
			danger: [],
		});
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { draw, textOf } from '../../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/classroom/classState', () => ({ classState: { roster: [], tables: [] } }));

interface Fake {
	main: Statement | null;
	challenge: Statement | null;
	proposals: Statement[];
}

const data: Fake = vi.hoisted(() => ({ main: null, challenge: null, proposals: [] }));
vi.mock('@/lib/classroom/projectorData', () => ({ projectorData: data }));

const { voteStage, summaryStage } = await import('../VoteStage');

function option(id: string, consensus: number): Statement {
	return { statementId: id, statement: `text-${id}`, consensus } as unknown as Statement;
}

function challengeWith(
	liveResults: boolean | undefined,
	ballot: Record<string, unknown>,
): Statement {
	return {
		statementId: 'ch',
		selections: { a: 7, b: 1, c: 2 },
		statementSettings: {
			ballot: { candidateIds: ['a', 'b', 'c'], frozenAt: 1, ...ballot },
			voteDisplay: liveResults === undefined ? {} : { liveResults },
		},
	} as unknown as Statement;
}

beforeEach(() => {
	data.main = { statementId: 'm', creatorId: 'teacher' } as unknown as Statement;
	data.proposals = [option('a', 0.1), option('b', 0.9), option('c', 0.5)];
});

describe('projector vote step', () => {
	it('missing setting = closed: names only, no counts, no bars, a neutral note', () => {
		data.challenge = challengeWith(undefined, {});
		const drawn = draw(voteStage());

		expect(drawn.classes).not.toContain('projector-tally__count');
		expect(drawn.classes).not.toContain('projector-tally__track');
		expect(drawn.classes).toContain('projector-tally__row--names');
		expect(textOf(voteStage())).toContain('voting.results_later');
		expect(textOf(voteStage())).toContain('text-a');
	});

	it('closed: the order does not follow the votes (a has the most votes but the lowest rating)', () => {
		data.challenge = challengeWith(false, {});
		data.challenge.statementSettings = {
			...data.challenge.statementSettings,
			voteDisplay: { liveResults: false, order: 'votes' },
		} as Statement['statementSettings'];
		const text = textOf(voteStage());

		expect(text.indexOf('text-b')).toBeLessThan(text.indexOf('text-a'));
	});

	it('closed ballot with the results closed: no winner order, no counts, says the vote is closed', () => {
		data.challenge = challengeWith(false, { closedAt: 5, decisionId: 'a' });
		const drawn = draw(voteStage());
		const text = drawn.text.join(' ');

		expect(drawn.classes).not.toContain('projector-tally__count');
		expect(text).toContain('voting.closed_hidden');
		expect(text.indexOf('text-b')).toBeLessThan(text.indexOf('text-a'));
	});

	it('opened to the class: counts and bars are drawn', () => {
		data.challenge = challengeWith(true, {});
		const drawn = draw(voteStage());

		expect(drawn.classes).toContain('projector-tally__count');
		expect(drawn.classes).toContain('projector-tally__track');
		expect(textOf(voteStage())).not.toContain('voting.results_later');
	});
});

describe('projector summary step', () => {
	it('closed results: no decision, no winner tag, no counts, no support block, a note', () => {
		data.challenge = challengeWith(undefined, { closedAt: 5, decisionId: 'a' });
		const drawn = draw(summaryStage());
		const text = drawn.text.join(' ');

		expect(drawn.classes).not.toContain('projector-decision');
		expect(drawn.classes).not.toContain('projector-results__count');
		expect(drawn.classes).not.toContain('projector-results__track');
		expect(drawn.classes).not.toContain('projector-support-block');
		expect(drawn.classes).not.toContain('projector-results__row--winner');
		expect(text).not.toContain('summary.winner');
		expect(text).toContain('voting.results_later');
	});

	it('opened results: the decision, the winner and the counts are drawn', () => {
		data.challenge = challengeWith(true, { closedAt: 5, decisionId: 'a' });
		const drawn = draw(summaryStage());

		expect(drawn.classes).toContain('projector-decision');
		expect(drawn.classes).toContain('projector-results__row--winner');
		expect(drawn.classes).toContain('projector-results__count');
		expect(drawn.classes).toContain('projector-support-block');
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { draw } from '../../../__tests__/vnodeText';
import { summaryOf } from '@/lib/classroom/voteSummary';

const current = vi.hoisted(() => ({
	challenge: null as Statement | null,
	options: [] as Statement[],
}));

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/student-c3.scss', () => ({}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: {
		view: (vnode: {
			attrs: { instruction?: string; action?: m.Children };
			children: m.Children;
		}) => [vnode.attrs.instruction, vnode.attrs.action, vnode.children],
	},
}));
vi.mock('../../replies/ReplyEntry', () => ({ ReplyEntry: { view: () => null } }));
vi.mock('../FlowFeed', () => ({
	FlowFeed: class {
		options: Statement[] = current.options;
		sync(): void {}
		stop(): void {}
	},
}));
vi.mock('@/lib/classroom/c3Data', () => ({
	currentUid: () => 'u1',
	listenMyVote: () => () => undefined,
}));
vi.mock('@/lib/classroom/studentWrites', () => ({ castVote: () => Promise.resolve() }));

vi.mock('@/lib/lesson', () => ({ getChallengeQuestion: () => current.challenge }));
vi.mock('@/lib/store', () => ({ getSubQuestions: () => [] }));

const { VoteScreen } = await import('../VoteScreen');
const { VoteResults } = await import('../VoteResults');

function option(id: string, consensus: number): Statement {
	return { statementId: id, statement: `text-${id}`, consensus } as unknown as Statement;
}

const proposals = [option('a', 0.1), option('b', 0.9), option('c', 0.5)];
current.options.push(...proposals);

function challengeWith(
	liveResults: boolean | undefined,
	ballot: Record<string, unknown>,
	order?: string,
): Statement {
	return {
		statementId: 'ch',
		selections: { a: 7, b: 1, c: 2 },
		statementSettings: {
			ballot: { candidateIds: ['a', 'b', 'c'], frozenAt: 1, ...ballot },
			voteDisplay: { ...(liveResults === undefined ? {} : { liveResults }), order },
		},
	} as unknown as Statement;
}

function drawVoteScreen(): ReturnType<typeof draw> & { joined: string } {
	const vnode = { attrs: { main: { statementId: 'm' } as Statement }, state: {} };
	const screen = VoteScreen as unknown as {
		oninit: (v: unknown) => void;
		view: (v: unknown) => m.Vnode;
	};
	screen.oninit(vnode);
	const drawn = draw(screen.view(vnode));

	return { ...drawn, joined: drawn.text.join(' ') };
}

beforeEach(() => {
	current.challenge = null;
});

describe('student vote screen obeys the results setting', () => {
	it('missing setting = closed: no numbers, no bars, a calm role=status line', () => {
		current.challenge = challengeWith(undefined, {});
		const screen = drawVoteScreen();

		expect(screen.classes).not.toContain('vote-list__result');
		expect(screen.classes).not.toContain('vote-list__count');
		expect(screen.classes).toContain('vote__results-later');
		expect(screen.joined).toContain('voting.results_later');
		expect(screen.joined).not.toContain('voting.result_votes');
	});

	it('closed and ordered "by votes": the cards still do not follow the votes', () => {
		current.challenge = challengeWith(false, {}, 'votes');
		const { joined } = drawVoteScreen();

		// a has the most votes and the lowest rating: by rating it comes last
		expect(joined.indexOf('text-b')).toBeLessThan(joined.indexOf('text-a'));
	});

	it('closed ballot, results closed: no winner badge, no vote order, "closed, results later"', () => {
		current.challenge = challengeWith(false, { closedAt: 5, decisionId: 'a' });
		const screen = drawVoteScreen();

		expect(screen.classes).not.toContain('vote-list__item--winner');
		expect(screen.joined).not.toContain('summary.winner');
		expect(screen.joined).not.toContain('voting.result_votes');
		expect(screen.joined).toContain('voting.closed_hidden');
		expect(screen.joined.indexOf('text-b')).toBeLessThan(screen.joined.indexOf('text-a'));
	});

	it('opened to the class: the numbers show, and a closed ballot shows its winner first', () => {
		current.challenge = challengeWith(true, { closedAt: 5, decisionId: 'a' });
		const screen = drawVoteScreen();

		expect(screen.classes).toContain('vote-list__item--winner');
		expect(screen.joined).toContain('voting.result_votes');
		expect(screen.joined.indexOf('text-a')).toBeLessThan(screen.joined.indexOf('text-b'));
		expect(screen.classes).not.toContain('vote__results-later');
	});
});

describe('student summary vote result obeys the results setting', () => {
	const closed = { candidateIds: ['a', 'b', 'c'], closedAt: 5, decisionId: 'a' };
	const selections = { a: 7, b: 1, c: 2 };

	it('closed results: names only, no tag, no bar, no count, a status line', () => {
		const summary = summaryOf({ ballot: closed, selections, proposals, present: 10 });
		const drawn = draw(m(VoteResults, { summary, proposals, uid: 'u1' }));
		const text = drawn.text.join(' ');

		expect(drawn.classes).not.toContain('vote-result__bar');
		expect(drawn.classes).not.toContain('vote-result__count');
		expect(drawn.classes).not.toContain('vote-result__tag');
		expect(drawn.classes).not.toContain('vote-result__row--winner');
		expect(text).not.toContain('voting.result_votes');
		expect(text).toContain('voting.results_later');
		expect(text).toContain('text-a');
	});

	it('opened results: tags, bars and counts are drawn', () => {
		const summary = summaryOf({
			ballot: closed,
			selections,
			proposals,
			present: 10,
			resultsShown: true,
		});
		const drawn = draw(m(VoteResults, { summary, proposals, uid: 'u1' }));

		expect(drawn.classes).toContain('vote-result__row--winner');
		expect(drawn.classes).toContain('vote-result__count');
		expect(drawn.classes).toContain('vote-result__bar');
	});

	it('closed results: there is no decision text for the decision card (the winner stays unknown)', () => {
		const summary = summaryOf({ ballot: closed, selections, proposals, present: 10 });

		expect(summary.decisionText).toBeNull();
		expect(summary.showSupport).toBe(false);
	});
});

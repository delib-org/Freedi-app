import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { draw } from '../../../__tests__/vnodeText';

const current = vi.hoisted(() => ({ challenge: null as Statement | null }));

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/student-c3.scss', () => ({}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: { view: (vnode: { children: m.Children }) => vnode.children },
}));
vi.mock('../FlowFeed', () => ({
	FlowFeed: class {
		options: Statement[] = [];
		sync(): void {}
		stop(): void {}
	},
}));
vi.mock('../RateFaces', () => ({ RateFaces: { view: () => m('p.faces', 'faces') } }));
vi.mock('../VoteResults', () => ({ VoteResults: { view: () => null } }));
vi.mock('../DecisionCard', () => ({ DecisionCard: { view: () => null } }));
vi.mock('../SupportBySide', () => ({ SupportBySide: { view: () => m('p.bars', 'bars') } }));
vi.mock('@/lib/classroom/classState', () => ({ classState: { mySubscription: null } }));
vi.mock('@/lib/classroom/listeners', () => ({ listenRoster: () => () => undefined }));
vi.mock('@/lib/classroom/c3Data', () => ({ currentUid: () => 'u1' }));
vi.mock('@/lib/classroom/studentWrites', () => ({
	setMyDecisionSupport: () => Promise.resolve(),
}));
vi.mock('@/lib/lesson', () => ({ getChallengeQuestion: () => current.challenge }));
vi.mock('@/lib/store', () => ({ getSubQuestions: () => [] }));

const { SummaryScreen } = await import('../SummaryScreen');

function challengeWith(liveResults?: boolean, supportShown?: boolean): Statement {
	return {
		statementId: 'ch',
		selections: { a: 3 },
		statementSettings: {
			ballot: { candidateIds: ['a'], frozenAt: 1, closedAt: 2, decisionId: 'a' },
			voteDisplay: {
				...(liveResults === undefined ? {} : { liveResults }),
				...(supportShown === undefined ? {} : { supportShown }),
			},
		},
	} as unknown as Statement;
}

function drawSummary(): ReturnType<typeof draw> {
	const vnode = { attrs: { main: { statementId: 'm', creatorId: 't' } as Statement }, state: {} };
	const screen = SummaryScreen as unknown as {
		oninit: (v: unknown) => void;
		view: (v: unknown) => m.Vnode;
	};
	screen.oninit(vnode);

	return draw(screen.view(vnode));
}

beforeEach(() => {
	current.challenge = null;
});

describe('student Summary obeys the support-by-side switch', () => {
	it('missing flag: the faces and a calm line, no bars', () => {
		current.challenge = challengeWith(true);
		const drawn = drawSummary();

		expect(drawn.text).toContain('faces');
		expect(drawn.text).toContain('summary.support_later');
		expect(drawn.text).not.toContain('bars');
	});

	it('shared with the class: the bars, no calm line', () => {
		current.challenge = challengeWith(true, true);
		const drawn = drawSummary();

		expect(drawn.text).toContain('bars');
		expect(drawn.text).not.toContain('summary.support_later');
	});

	it('results closed win over a shared support: no bars at all', () => {
		current.challenge = challengeWith(false, true);
		const drawn = drawSummary();

		expect(drawn.text).not.toContain('bars');
	});
});

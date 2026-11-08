import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/student-state.scss', () => ({}));
vi.mock('@/lib/firebase', () => ({
	db: {},
	doc: () => ({}),
	getDoc: () =>
		Promise.resolve({ exists: () => true, data: () => ({ statement: 'the-winner-text' }) }),
}));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: { view: (vnode: { children: m.Children }) => vnode.children },
}));
vi.mock('../c3/DecisionCard', () => ({
	DecisionCard: { view: (vnode: { attrs: { text: string } }) => `decision:${vnode.attrs.text}` },
}));

const store = vi.hoisted(() => ({ challenge: null as unknown }));
vi.mock('@/lib/lesson', () => ({
	getChallengeQuestion: () => store.challenge,
	lessonStepOf: () => ({ key: 'summary' }),
	stepLabel: (key: string) => key,
}));
vi.mock('@/lib/store', () => ({ getSubQuestions: () => [] }));

const { LessonStateScreen } = await import('../LessonStateScreen');

function challengeWith(liveResults?: boolean): Statement {
	return {
		statementId: 'ch',
		statementSettings: {
			ballot: { candidateIds: ['w'], frozenAt: 1, closedAt: 2, decisionId: 'w' },
			voteDisplay: liveResults === undefined ? {} : { liveResults },
		},
	} as unknown as Statement;
}

function drawEnded(): string {
	const screen = LessonStateScreen as unknown as { view: (vnode: unknown) => m.Children };

	return textOf(
		screen.view({ attrs: { status: 'ended', main: { statement: 'lesson' } as Statement } }),
	);
}

describe('ended lesson screen on the phones', () => {
	beforeEach(() => {
		vi.spyOn(m, 'redraw').mockImplementation(() => undefined);
		store.challenge = null;
	});

	it('results closed (missing setting): the decision, which is the winner, is not shown', async () => {
		store.challenge = challengeWith();
		drawEnded();
		await Promise.resolve();

		expect(drawEnded()).not.toContain('the-winner-text');
		expect(drawEnded()).not.toContain('decision:');
	});

	it('results opened to the class: the decision is shown once it is fetched', async () => {
		store.challenge = challengeWith(true);
		drawEnded();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(drawEnded()).toContain('decision:the-winner-text');
	});
});

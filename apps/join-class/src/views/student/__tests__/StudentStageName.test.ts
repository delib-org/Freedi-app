import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement, StatementSubscription } from '@freedi/shared-types';

const userState: { user: { displayName: string | null; isAnonymous: boolean } | null } = {
	user: { displayName: null, isAnonymous: true },
};
let deviceName: string | null = null;

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/classroom/studentWrites', () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock('@/lib/classroom/listeners', () => ({}));
vi.mock('@/lib/classroom/studentNotices', () => ({ startStudentNotices: vi.fn() }));
vi.mock('@/lib/user', () => ({ getUserState: () => userState }));
vi.mock('@/lib/store', () => ({ getCustomDisplayName: () => deviceName }));
vi.mock('@/lib/studentStage', () => ({ setStudentStage: vi.fn() }));
vi.mock('@/lib/lessonCore', () => ({ lessonStatusOfMain: () => 'live' }));
vi.mock('@/lib/lesson', () => ({
	lessonStepOf: () => ({ key: 'summary', index: 7 }),
	planStepKeys: () => [],
}));
vi.mock('../prefetchSteps', () => ({ prefetchStepChunks: vi.fn() }));
vi.mock('../replies/replyHost', () => ({ startReplyHost: vi.fn() }));
vi.mock('../c2/NameGate', () => ({ NameGate: { view: () => 'NAME-GATE' } }));
vi.mock('../steps/AllProposalsStep', () => ({ AllProposalsStep: { view: () => 'step' } }));
vi.mock('../steps/OpeningStep', () => ({ OpeningStep: { view: () => 'step' } }));
vi.mock('../steps/ProposalsStep', () => ({ ProposalsStep: { view: () => 'step' } }));
vi.mock('../steps/SideStep', () => ({ SideStep: { view: () => 'step' } }));
vi.mock('../steps/SummaryStep', () => ({ SummaryStep: { view: () => 'SUMMARY-STEP' } }));
vi.mock('../steps/TableTalkStep', () => ({ TableTalkStep: { view: () => 'step' } }));
vi.mock('../steps/TablesStep', () => ({ TablesStep: { view: () => 'step' } }));
vi.mock('../steps/VoteStep', () => ({ VoteStep: { view: () => 'step' } }));
vi.mock('../steps/WaitingStep', () => ({ WaitingStep: { view: () => 'step' } }));

const { classState } = await import('@/lib/classroom/classState');
const { StudentStage } = await import('../StudentStage');

/**
 * Trello dZQmKXRY: a student who reached the lesson at a LATE step (here the summary)
 * with no name still gets the name form, not the step.
 */

function render(): m.Vnode {
	return (StudentStage.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { main: { statementId: 'main1' } as Statement },
	} as unknown as m.Vnode);
}

function subNamed(displayName: string): StatementSubscription {
	return { user: { uid: 'u', displayName } } as unknown as StatementSubscription;
}

describe('StudentStage puts the name form in front of any step', () => {
	beforeEach(() => {
		userState.user = { displayName: null, isAnonymous: true };
		deviceName = null;
		classState.mySubscription = null;
		classState.mySubscriptionLoaded = true;
	});

	it('a nameless student at the summary step gets the form', () => {
		expect((render().tag as { view: () => string }).view()).toBe('NAME-GATE');
	});

	it('a student with a name goes straight to the step', () => {
		classState.mySubscription = subNamed('Dana');
		expect((render().tag as { view: () => string }).view()).toBe('SUMMARY-STEP');
	});

	it('nobody is asked before their subscription has answered', () => {
		classState.mySubscriptionLoaded = false;
		expect((render().tag as { view: () => string }).view()).toBe('SUMMARY-STEP');
	});
});

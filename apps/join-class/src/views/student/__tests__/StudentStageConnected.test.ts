import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement, StatementSubscription } from '@freedi/shared-types';

const userState: { user: { displayName: string | null; isAnonymous: boolean } | null } = {
	user: { displayName: null, isAnonymous: true },
};
let deviceName: string | null = null;

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/classroom/studentWrites', () => ({ ensureMemberSubscription: vi.fn() }));
vi.mock('@/lib/classroom/arrivalActions', () => ({ gateMemory: { reenter: false } }));
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
vi.mock('../c2/RegisteredNameGate', () => ({
	RegisteredNameGate: { view: () => 'REGISTERED-GATE' },
}));
vi.mock('../c2/SeatMoved', () => ({ SeatMoved: { view: () => 'SEAT-MOVED' } }));
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
 * A connected lesson (IA tables-class-bridge 7): walk-ins MUST come in through the
 * full-name gate (`classArriveByName`), never the old join, and a seat another
 * device took says so.
 */

function render(connected: boolean): m.Vnode {
	const main = {
		statementId: 'main1',
		statementSettings: connected
			? { classRegistration: { tableAssignmentId: 'r1', connectedAt: 1 } }
			: {},
	} as unknown as Statement;

	return (StudentStage.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { main },
	} as unknown as m.Vnode);
}

function out(connected: boolean): string {
	return (render(connected).tag as { view: () => string }).view();
}

function sub(fields: Record<string, unknown>): StatementSubscription {
	return { user: { uid: 'u', displayName: 'Dana' }, ...fields } as unknown as StatementSubscription;
}

describe('StudentStage in a connected lesson', () => {
	beforeEach(() => {
		userState.user = { displayName: null, isAnonymous: true };
		deviceName = 'Dana';
		classState.mySubscription = null;
		classState.mySubscriptionLoaded = true;
	});

	it('a walk-in with a name on the device still gets the full-name gate', () => {
		expect(out(true)).toBe('REGISTERED-GATE');
	});

	it('an ordinary lesson keeps the ordinary behaviour for the same student', () => {
		expect(out(false)).toBe('SUMMARY-STEP');
	});

	it('a student who arrived goes to the step', () => {
		classState.mySubscription = sub({});
		expect(out(true)).toBe('SUMMARY-STEP');
	});

	it('a seat that another device took shows the seat-moved state', () => {
		classState.mySubscription = sub({ seatMovedAt: 1700 });
		expect(out(true)).toBe('SEAT-MOVED');
	});
});

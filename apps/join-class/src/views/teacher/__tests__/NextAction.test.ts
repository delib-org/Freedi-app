import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { NextActionSpec } from '@/lib/classroom/nextAction';

vi.mock('../consoleState', () => ({ isBusy: (key: string): boolean => key === 'busy-key' }));
vi.mock('../consoleActions', () => ({
	assignTables: vi.fn(),
	changeLessonStatus: vi.fn(),
	closeBallot: vi.fn(),
	freezeBallot: vi.fn(),
	goToStep: vi.fn(),
	setVoteDisplay: vi.fn(),
}));
vi.mock('../consoleConfirms', () => ({ confirmCloseVote: vi.fn() }));
vi.mock('../EndChoice', () => ({ openEndChoice: vi.fn() }));
vi.mock('../consoleBack', () => ({ planBack: () => ({ href: '/t/plans/p1', label: 'Plan' }) }));
vi.mock('../registrationActions', () => ({ copySeating: vi.fn() }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

const focusReason = vi.fn();
vi.stubGlobal('document', {
	getElementById: (id: string) => (id === 'next-action-reason' ? { focus: focusReason } : null),
});

import { NextAction } from '../NextAction';
import type { NextActionAttrs } from '../NextAction';
import { assignTables, goToStep, freezeBallot, closeBallot } from '../consoleActions';
import { confirmCloseVote } from '../consoleConfirms';

type View = (vnode: { attrs: NextActionAttrs }) => m.Vnode;

function draw(spec: NextActionSpec, extra: Partial<NextActionAttrs> = {}): m.Vnode {
	const attrs: NextActionAttrs = { mid: 'mid1', spec, challengeId: 'q1', ...extra };

	return (NextAction.view as unknown as View)({ attrs });
}

function children(vnode: m.Vnode): m.Vnode[] {
	return (vnode.children as m.Vnode[]).filter(Boolean);
}

function button(vnode: m.Vnode): m.Vnode {
	return children(vnode)[0];
}

const GO_NEXT: NextActionSpec = {
	kind: 'goNext',
	labelKey: 'console.next',
	nextIndex: 5,
	nextStepKey: 'proposals',
	busyKey: 'step:5',
	busyLabelKey: 'console.busy_opening',
};

describe('NextAction', () => {
	beforeEach(() => vi.clearAllMocks());

	it('draws one primary button and no reason when the step can move on', () => {
		const vnode = draw(GO_NEXT);
		expect(children(vnode)).toHaveLength(1);
		const attrs = button(vnode).attrs as Record<string, unknown>;
		expect(attrs.disabled).toBeUndefined();
		expect(attrs['aria-disabled']).toBeUndefined();
		expect(attrs['data-testid']).toBe('console-forward');
	});

	it('runs the work of the step it names', () => {
		(button(draw(GO_NEXT)).attrs as { onclick: () => void }).onclick();
		expect(goToStep).toHaveBeenCalledWith('mid1', 5);
		(
			button(draw({ kind: 'openVote', labelKey: 'console.open_vote' })).attrs as {
				onclick: () => void;
			}
		).onclick();
		expect(freezeBallot).toHaveBeenCalledWith('mid1');
	});

	it('closing a vote with students left asks first and does not close', () => {
		const spec: NextActionSpec = {
			kind: 'closeVote',
			labelKey: 'console.close_vote',
			confirm: { kind: 'closeVote', notVoted: 3 },
		};
		(button(draw(spec)).attrs as { onclick: () => void }).onclick();
		expect(confirmCloseVote).toHaveBeenCalledWith('mid1', 3);
		expect(closeBallot).not.toHaveBeenCalled();
	});

	it('is announced as unavailable, stays focusable, and is read with its reason', () => {
		const vnode = draw({
			kind: 'split',
			labelKey: 'console.split',
			blockedKey: 'console.blocked.no_students',
		});
		const attrs = button(vnode).attrs as Record<string, unknown>;
		expect(attrs['aria-disabled']).toBe('true');
		expect(attrs.disabled).toBeUndefined();
		expect(attrs['aria-describedby']).toBe('next-action-reason');
		const reason = children(vnode)[1];
		expect((reason.attrs as Record<string, unknown>).id).toBe('next-action-reason');
	});

	it('a tap on a blocked button moves focus to its reason and runs nothing', () => {
		const vnode = draw({
			kind: 'split',
			labelKey: 'console.split',
			blockedKey: 'console.blocked.no_students',
		});
		(button(vnode).attrs as { onclick: () => void }).onclick();
		expect(focusReason).toHaveBeenCalledTimes(1);
		expect(assignTables).not.toHaveBeenCalled();
	});

	it('a blocked press does not run the action', () => {
		const vnode = draw({
			kind: 'openVote',
			labelKey: 'console.open_vote',
			blockedKey: 'console.blocked.no_proposals',
		});
		(button(vnode).attrs as { onclick: () => void }).onclick();
		expect(freezeBallot).not.toHaveBeenCalled();
	});

	it('shows the busy words and ignores presses while its write runs, without losing focus', () => {
		const vnode = draw({ ...GO_NEXT, busyKey: 'busy-key' });
		const attrs = button(vnode).attrs as Record<string, unknown>;
		// `disabled` would drop the keyboard focus to the body; aria-disabled keeps it.
		expect(attrs.disabled).toBeUndefined();
		expect(attrs['aria-disabled']).toBe('true');
		(attrs.onclick as () => void)();
		expect(goToStep).not.toHaveBeenCalled();
		expect(attrs['aria-busy']).toBe('true');
		expect((button(vnode).children as m.Vnode[])[0].children).toBe('console.busy_opening');
	});

	it('a connected lesson that is not published yet blocks "bring the tables" with the registration reason', () => {
		const vnode = draw(
			{ kind: 'copySeating', labelKey: 'console.copy_seating' },
			{ copyBlockedKey: 'console.copy_seating.not_ready.ranked' },
		);
		expect((button(vnode).attrs as Record<string, unknown>)['aria-disabled']).toBe('true');
	});
});

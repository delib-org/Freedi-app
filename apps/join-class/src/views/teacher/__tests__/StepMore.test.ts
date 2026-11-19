import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/console-vote-order.scss', () => ({}));
vi.mock('@/styles/console-vote-bar.scss', () => ({}));
vi.mock('../consoleActions', () => ({
	allTablesNewTurn: vi.fn(),
	allTablesTo: vi.fn(),
	pauseBallot: vi.fn(),
	setVoteDisplay: vi.fn(),
	setVoteOrder: vi.fn(),
	startPlenum: vi.fn(),
}));
vi.mock('../consoleConfirms', () => ({
	confirmResetTurns: vi.fn(),
	confirmResetVote: vi.fn(),
	confirmResplit: vi.fn(),
	confirmSkipVote: vi.fn(),
}));
vi.mock('../consoleState', () => ({
	consoleState: { options: new Map() },
	isBusy: (): boolean => false,
}));
vi.mock('../ConsoleSettings', () => ({ requestSettingsOpen: vi.fn() }));
vi.mock('../LessonMore', () => ({ LESSON_MORE_ID: 'lesson-more' }));
vi.mock('../registrationActions', () => ({ copySeating: vi.fn() }));
vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));
vi.mock('../voteScopeState', () => ({
	voteScopeOf: () => ({ onlyAbove: false, total: 3, above: 1, locked: false, onChange: vi.fn() }),
}));

import { StepMore } from '../StepMore';
import type { StepMoreAttrs } from '../StepMore';
import { confirmResetVote, confirmSkipVote } from '../consoleConfirms';

const CHALLENGE = { statementId: 'q1', statementSettings: {} } as unknown as Statement;
const BASE: StepMoreAttrs = {
	mid: 'm1',
	status: 'live',
	stepKey: 'vote',
	steps: [
		'waiting',
		'opening',
		'side',
		'tables',
		'tableTalk',
		'proposals',
		'allProposals',
		'vote',
		'summary',
	],
	challenge: CHALLENGE,
	main: null,
	hasTables: true,
	plenum: false,
	connected: false,
	copyOffer: { kind: 'ordinary' },
};

function view(patch: Partial<StepMoreAttrs>): m.Vnode | null {
	return (StepMore.view as unknown as (v: { attrs: StepMoreAttrs }) => m.Vnode | null)({
		attrs: { ...BASE, ...patch },
	});
}

interface DisclosureLike {
	attrs: { content: (close: () => void) => m.Children; label: string };
}

function content(patch: Partial<StepMoreAttrs>): m.Children {
	const vnode = view(patch) as unknown as DisclosureLike;

	return vnode.attrs.content(() => undefined);
}

function find(node: m.Children, pick: (v: m.Vnode) => boolean, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => find(c, pick, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		if (pick(v)) out.push(v);
		find(v.children as m.Children, pick, out);
	}

	return out;
}

describe('StepMore', () => {
	it.each(['waiting', 'opening', 'side', 'allProposals'] as const)(
		'is not drawn at %s',
		(stepKey) => {
			expect(view({ stepKey })).toBeNull();
		},
	);

	it('is not drawn when the lesson has ended', () => {
		expect(view({ status: 'ended' })).toBeNull();
	});

	it('is called "More for this step"', () => {
		expect((view({}) as unknown as DisclosureLike).attrs.label).toBe('console.step_more');
	});

	it('before the vote opens: the skip is here, the reset is not', () => {
		const text = textOf(content({}));
		expect(text).toContain('console.vote_scope');
		expect(text).toContain('console.vote_skip');
		expect(text).not.toContain('console.reset_vote');
	});

	it('the skip asks through the confirm, naming the summary step', () => {
		const skip = find(
			content({}),
			(v) =>
				(v.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === 'console-skip-vote',
		)[0];
		(skip.attrs as { onclick: () => void }).onclick();
		expect(confirmSkipVote).toHaveBeenCalledWith('m1', 8);
	});

	it('an open vote has no skip; its red reset is the last thing in the panel and asks first', () => {
		const challenge = {
			statementId: 'q1',
			statementSettings: { ballot: { candidateIds: ['a'], frozenAt: 1, pausedAt: 2 } },
		} as unknown as Statement;
		const children = content({ challenge }) as m.Vnode[];
		const text = textOf(children);
		expect(text).not.toContain('console.vote_skip');
		const last = children[children.length - 1];
		expect((last.attrs as { class?: string } | null)?.class ?? '').toBe('');
		expect(last.tag).toBe('div');
		expect(textOf(last)).toContain('console.reset_vote');
		const reset = find(
			last,
			(v) =>
				(v.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === 'console-reset-vote',
		)[0];
		(reset.attrs as { onclick: () => void }).onclick();
		expect(confirmResetVote).toHaveBeenCalledWith('m1');
	});
});

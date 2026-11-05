import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { draw, textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/console-vote-order.scss', () => ({}));
vi.mock('@/styles/console-vote-bar.scss', () => ({}));
vi.mock('../consoleState', () => ({ isBusy: (): boolean => false }));

const store = vi.hoisted(() => ({ challenge: null as Statement | null }));
vi.mock('@/lib/lessonCore', () => ({ getChallengeQuestion: () => store.challenge }));
vi.mock('@/lib/store', () => ({ getSubQuestions: () => [] }));
vi.mock('../consoleActions', () => ({
	closeBallot: vi.fn(),
	goToStep: vi.fn(),
	resetTurns: vi.fn(),
	resetVote: vi.fn(),
	setVoteDisplay: vi.fn(),
}));
vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));

const { ResultsAudienceSwitch, ResultsChip, VOTE_RESULTS_AUDIENCE } = await import(
	'../ResultsAudienceSwitch'
);
const { VoteBar } = await import('../VoteBar');
const { resultsAside } = await import('../consoleConfirms');

const noop = (): void => undefined;

function challenge(liveResults?: boolean): Statement {
	return {
		statementId: 'ch',
		statementSettings: { voteDisplay: liveResults === undefined ? {} : { liveResults } },
	} as unknown as Statement;
}

interface RadioAttrs {
	type?: string;
	value?: string;
	checked?: boolean;
	onchange?: () => void;
}

function radios(node: m.Children): RadioAttrs[] {
	const found: RadioAttrs[] = [];
	const visit = (child: unknown): void => {
		if (Array.isArray(child)) child.forEach(visit);
		else if (child && typeof child === 'object' && 'tag' in child) {
			const vnode = child as m.Vnode;
			if (vnode.tag === 'input') found.push(vnode.attrs as RadioAttrs);
			visit(vnode.children);
		}
	};
	visit(node);

	return found;
}

function switchView(shown: boolean, onChange: (shown: boolean) => void = noop): m.Children {
	const component = ResultsAudienceSwitch as unknown as {
		view: (vnode: { attrs: unknown }) => m.Children;
	};

	return component.view({
		attrs: { ...VOTE_RESULTS_AUDIENCE, shown, disabled: false, onChange },
	});
}

describe('ResultsAudienceSwitch', () => {
	it('is a two-option radiogroup: Only me / The whole class', () => {
		const view = switchView(false);
		const drawn = draw(view);

		expect(drawn.roles).toContain('radiogroup');
		expect(radios(view).map((r) => r.value)).toEqual(['me', 'class']);
		expect(drawn.text).toContain('console.results_audience');
		expect(drawn.text).toContain('console.results_audience_me');
		expect(drawn.text).toContain('console.results_audience_class');
	});

	it('closed: "Only me" is checked and the hint explains how to open', () => {
		const view = switchView(false);

		expect(radios(view).map((r) => r.checked)).toEqual([true, false]);
		expect(textOf(view)).toContain('console.results_hint_closed');
	});

	it('open: "The whole class" is checked and there is no hint', () => {
		const view = switchView(true);

		expect(radios(view).map((r) => r.checked)).toEqual([false, true]);
		expect(textOf(view)).not.toContain('console.results_hint_closed');
	});

	it('choosing an option reports the new value, both ways, with no confirm', () => {
		const onChange = vi.fn();
		const [me, whole] = radios(switchView(false, onChange));

		whole.onchange?.();
		me.onchange?.();

		expect(onChange.mock.calls).toEqual([[true], [false]]);
	});
});

describe('ResultsChip', () => {
	it('closed: lock text, polite live region', () => {
		const component = ResultsChip as unknown as {
			view: (vnode: { attrs: { shown: boolean } }) => m.Vnode;
		};
		const closed = component.view({ attrs: { shown: false } });
		const open = component.view({ attrs: { shown: true } });

		expect((closed.attrs as { 'aria-live': string })['aria-live']).toBe('polite');
		expect(textOf(closed)).toContain('console.results_chip_closed');
		expect(textOf(open)).toContain('console.results_chip_shown');
	});
});

describe('the Vote bar carries the control', () => {
	it('draws the chip and the audience switch next to the order switch', () => {
		const component = VoteBar as unknown as {
			view: (vnode: { attrs: unknown }) => m.Vnode;
		};
		const bar = component.view({
			attrs: {
				held: true,
				ended: false,
				ballotFrozen: true,
				ballotPaused: false,
				ballotClosed: false,
				votedCount: 0,
				presentCount: 0,
				allVoted: false,
				hasChallenge: true,
				voteOrder: 'consensus',
				onVoteOrder: noop,
				resultsShown: false,
				onResultsShown: noop,
				onFreeze: noop,
				onPauseVote: noop,
				onCloseVote: noop,
				onResetVote: noop,
			},
		});
		const text = textOf(bar);

		expect(text).toContain('console.results_chip_closed');
		expect(text).toContain('console.results_audience');
		expect(text).toContain('console.vote_order');
	});
});

describe('the close-and-go confirm prompt', () => {
	beforeEach(() => {
		store.challenge = null;
	});

	it('results closed: says so, with an inline "show to the class" action', () => {
		store.challenge = challenge();
		const text = textOf(resultsAside());

		expect(text).toContain('console.close_and_go_results_closed');
		expect(text).toContain('console.close_and_go_show');
	});

	it('results open: says they are shown, with no action', () => {
		store.challenge = challenge(true);
		const text = textOf(resultsAside());

		expect(text).toContain('console.results_chip_shown');
		expect(text).not.toContain('console.close_and_go_show');
	});
});

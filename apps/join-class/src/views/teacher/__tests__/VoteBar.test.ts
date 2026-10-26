import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
// The console state pulls in Firebase; the bar only asks whether an action is in flight.
vi.mock('../consoleState', () => ({ isBusy: (): boolean => false }));

import { VoteBar } from '../VoteBar';
import type { VoteBarAttrs } from '../VoteBar';

const noop = (): void => undefined;

const attrsFor = (frozen: boolean, paused: boolean, closed: boolean): VoteBarAttrs => ({
	held: false,
	ended: false,
	ballotFrozen: frozen,
	ballotPaused: paused,
	ballotClosed: closed,
	votedCount: 1,
	presentCount: 2,
	allVoted: false,
	hasChallenge: true,
	voteOrder: 'random',
	onVoteOrder: noop,
	onFreeze: noop,
	onPauseVote: noop,
	onCloseVote: noop,
	onResetVote: noop,
});

/** Calls the view the way Mithril does; building the vnodes throws on a keyed/unkeyed mix. */
const draw = (attrs: VoteBarAttrs): m.Vnode => {
	const component = VoteBar as { view: (vnode: { attrs: VoteBarAttrs }) => m.Vnode };

	return component.view({ attrs });
};

describe('VoteBar view', () => {
	it.each([
		['not open (one ballot button)', attrsFor(false, false, false)],
		['open', attrsFor(true, false, false)],
		['paused', attrsFor(true, true, false)],
		['closed (no ballot button)', attrsFor(true, false, true)],
	])('draws without a Mithril error: %s', (_label, attrs) => {
		expect(() => draw(attrs)).not.toThrow();
	});
});

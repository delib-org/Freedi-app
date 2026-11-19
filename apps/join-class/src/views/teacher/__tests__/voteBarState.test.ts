import { describe, expect, it } from 'vitest';
import { phaseOf, voteBarState } from '../voteBarState';
import type { BallotFlags } from '../voteBarState';

const flags = (frozen: boolean, paused: boolean, closed: boolean): BallotFlags => ({
	ballotFrozen: frozen,
	ballotPaused: paused,
	ballotClosed: closed,
});

describe('voteBarState', () => {
	it('not open: the chip says so and there is nothing to pause', () => {
		const state = voteBarState(flags(false, false, false));
		expect(state.phase).toBe('notOpen');
		expect(state.chip.labelKey).toBe('console.vote_status_not_open');
		expect(state.pause).toBeNull();
	});

	it('open: the vote can be paused (closing it is the console primary button)', () => {
		const state = voteBarState(flags(true, false, false));
		expect(state.chip.labelKey).toBe('console.vote_status_open');
		expect(state.pause?.key).toBe('pauseVote');
		expect(state.pause?.labelKey).toBe('console.pause_vote');
	});

	it('paused: the vote can be resumed', () => {
		const state = voteBarState(flags(true, true, false));
		expect(state.chip.icon).toBe('pause');
		expect(state.pause?.key).toBe('pauseVote');
		expect(state.pause?.labelKey).toBe('console.resume_vote');
	});

	it('closed: lock chip and no ballot control, whatever the other flags say', () => {
		const state = voteBarState(flags(true, true, true));
		expect(state.phase).toBe('closed');
		expect(state.chip.icon).toBe('lock');
		expect(state.pause).toBeNull();
	});

	it('phaseOf treats an unfrozen ballot as not open even if paused', () => {
		expect(phaseOf(flags(false, true, false))).toBe('notOpen');
	});
});

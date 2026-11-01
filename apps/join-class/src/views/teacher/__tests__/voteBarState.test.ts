import { describe, expect, it } from 'vitest';
import { phaseOf, voteBarState } from '../voteBarState';
import type { BallotFlags } from '../voteBarState';

const flags = (frozen: boolean, paused: boolean, closed: boolean): BallotFlags => ({
	ballotFrozen: frozen,
	ballotPaused: paused,
	ballotClosed: closed,
});

describe('voteBarState', () => {
	it('not open: only "open the vote", primary', () => {
		const state = voteBarState(flags(false, false, false));
		expect(state.phase).toBe('notOpen');
		expect(state.chip.labelKey).toBe('console.vote_status_not_open');
		expect(state.primary?.key).toBe('freeze');
		expect(state.secondary).toBeNull();
	});

	it('open: close is primary, pause is secondary', () => {
		const state = voteBarState(flags(true, false, false));
		expect(state.chip.labelKey).toBe('console.vote_status_open');
		expect(state.primary?.key).toBe('close');
		expect(state.secondary?.key).toBe('pauseVote');
		expect(state.secondary?.labelKey).toBe('console.pause_vote');
	});

	it('paused: resume is primary, close is secondary', () => {
		const state = voteBarState(flags(true, true, false));
		expect(state.chip.icon).toBe('pause');
		expect(state.primary?.key).toBe('pauseVote');
		expect(state.primary?.labelKey).toBe('console.resume_vote');
		expect(state.secondary?.key).toBe('close');
	});

	it('closed: lock chip and no ballot control, whatever the other flags say', () => {
		const state = voteBarState(flags(true, true, true));
		expect(state.phase).toBe('closed');
		expect(state.chip.icon).toBe('lock');
		expect(state.primary).toBeNull();
		expect(state.secondary).toBeNull();
	});

	it('phaseOf treats an unfrozen ballot as not open even if paused', () => {
		expect(phaseOf(flags(false, true, false))).toBe('notOpen');
	});
});

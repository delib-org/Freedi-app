import type { ConsoleIconName } from './ConsoleIcon';

/**
 * The vote bar's state machine as pure data: which status chip is shown and whether the
 * vote can be paused or resumed.
 */

export type VotePhase = 'notOpen' | 'open' | 'paused' | 'closed';

/** The data-action key the e2e scripts and the console handlers already use. */
export type VoteActionKey = 'pauseVote';

export interface VoteBarAction {
	key: VoteActionKey;
	labelKey: string;
	icon: ConsoleIconName;
}

export interface VoteBarState {
	phase: VotePhase;
	chip: { labelKey: string; icon: ConsoleIconName };
	/**
	 * The vote's own pause / resume. Opening and closing the vote are the console's primary
	 * button (lib/classroom/nextAction.ts), never a button here.
	 */
	pause: VoteBarAction | null;
}

export interface BallotFlags {
	ballotFrozen: boolean;
	ballotPaused: boolean;
	ballotClosed: boolean;
}

const PAUSE: VoteBarAction = { key: 'pauseVote', labelKey: 'console.pause_vote', icon: 'pause' };
const RESUME: VoteBarAction = { key: 'pauseVote', labelKey: 'console.resume_vote', icon: 'play' };

export function phaseOf(flags: BallotFlags): VotePhase {
	if (flags.ballotClosed) return 'closed';
	if (!flags.ballotFrozen) return 'notOpen';

	return flags.ballotPaused ? 'paused' : 'open';
}

export function voteBarState(flags: BallotFlags): VoteBarState {
	const phase = phaseOf(flags);
	switch (phase) {
		case 'notOpen':
			return {
				phase,
				chip: { labelKey: 'console.vote_status_not_open', icon: 'ballot' },
				pause: null,
			};
		case 'open':
			return { phase, chip: { labelKey: 'console.vote_status_open', icon: 'play' }, pause: PAUSE };
		case 'paused':
			return {
				phase,
				chip: { labelKey: 'console.vote_status_paused', icon: 'pause' },
				pause: RESUME,
			};
		case 'closed':
			return { phase, chip: { labelKey: 'console.vote_status_closed', icon: 'lock' }, pause: null };
	}
}

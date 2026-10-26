import type { ConsoleIconName } from './ConsoleIcon';

/**
 * The vote bar's state machine as pure data: which status chip is shown and
 * which ballot buttons exist. Only the next sensible action is primary.
 */

export type VotePhase = 'notOpen' | 'open' | 'paused' | 'closed';

/** The data-action keys the e2e scripts and the console handlers already use. */
export type VoteActionKey = 'freeze' | 'pauseVote' | 'close';

export interface VoteBarAction {
	key: VoteActionKey;
	labelKey: string;
	icon: ConsoleIconName;
}

export interface VoteBarState {
	phase: VotePhase;
	chip: { labelKey: string; icon: ConsoleIconName };
	primary: VoteBarAction | null;
	secondary: VoteBarAction | null;
}

export interface BallotFlags {
	ballotFrozen: boolean;
	ballotPaused: boolean;
	ballotClosed: boolean;
}

const OPEN: VoteBarAction = { key: 'freeze', labelKey: 'console.open_vote', icon: 'play' };
const PAUSE: VoteBarAction = { key: 'pauseVote', labelKey: 'console.pause_vote', icon: 'pause' };
const RESUME: VoteBarAction = { key: 'pauseVote', labelKey: 'console.resume_vote', icon: 'play' };
const CLOSE: VoteBarAction = { key: 'close', labelKey: 'console.close_vote', icon: 'stop' };

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
				primary: OPEN,
				secondary: null,
			};
		case 'open':
			return {
				phase,
				chip: { labelKey: 'console.vote_status_open', icon: 'play' },
				primary: CLOSE,
				secondary: PAUSE,
			};
		case 'paused':
			return {
				phase,
				chip: { labelKey: 'console.vote_status_paused', icon: 'pause' },
				primary: RESUME,
				secondary: CLOSE,
			};
		case 'closed':
			return {
				phase,
				chip: { labelKey: 'console.vote_status_closed', icon: 'lock' },
				primary: null,
				secondary: null,
			};
	}
}

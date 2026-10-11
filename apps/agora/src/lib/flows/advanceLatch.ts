/**
 * The console's NEXT, when the teacher holds two devices.
 *
 * The room moves through one transaction, forward only, and a press that
 * arrives after the room already moved is answered `stale`. On one device
 * that was a failure to shout about; with a phone and a laptop both signed
 * in it is the ordinary case — the other hand pressed first — and a red
 * "the advance failed, retry" on the second device would be a lie. So the
 * latch tells the two apart: stale while the room is already at or past
 * what this press intended is "moved from your other device", a quiet
 * line; stale with the room still behind is a real failure.
 *
 * The same rule reads the session doc: a pointer that moved while this
 * device was not pressing moved from elsewhere too.
 *
 * Pure. The console feeds it presses, the callable's answer, every
 * session snapshot, and a clock tick.
 */
export interface AdvanceLatch {
	/** A press is on its way to the server */
	advancing: boolean;
	/** The plan position the press meant to open */
	intended: number | null;
	pressedAt: number | null;
	/** The server refused or never answered — the strip says so, with a retry */
	failed: boolean;
	/** The room moved, but not by this device's hand — the strip's quiet line */
	movedElsewhere: boolean;
	/** The last pointer this device saw, to notice a move it did not make */
	lastStageIndex: number | null;
}

export type AdvanceEvent =
	| { kind: 'press'; toIndex: number; now: number }
	| { kind: 'ok' }
	/** The callable answered failed-precondition; `stageIndex` is the room as this device sees it now */
	| { kind: 'stale'; stageIndex: number }
	| { kind: 'error' }
	| { kind: 'snapshot'; stageIndex: number }
	| { kind: 'tick'; now: number }
	/** The quiet line was shown long enough */
	| { kind: 'dismiss' };

/** A press the server has not answered in this long is a failure, not a wait */
export const ADVANCE_TIMEOUT_MS = 15000;
/** How long the quiet "moved from your other device" line stays — long enough to read, short enough to go */
export const QUIET_LINE_MS = 5000;

export const INITIAL_ADVANCE_LATCH: AdvanceLatch = {
	advancing: false,
	intended: null,
	pressedAt: null,
	failed: false,
	movedElsewhere: false,
	lastStageIndex: null,
};

export function advanceReduce(state: AdvanceLatch, event: AdvanceEvent): AdvanceLatch {
	switch (event.kind) {
		case 'press':
			if (state.advancing) return state;

			return {
				...state,
				advancing: true,
				intended: event.toIndex,
				pressedAt: event.now,
				failed: false,
				movedElsewhere: false,
			};

		case 'ok':
			return { ...state, advancing: false, pressedAt: null };

		case 'stale': {
			const landed = state.intended !== null && event.stageIndex >= state.intended;

			return {
				...state,
				advancing: false,
				pressedAt: null,
				failed: !landed,
				movedElsewhere: landed,
			};
		}

		case 'error':
			return { ...state, advancing: false, pressedAt: null, failed: true };

		case 'snapshot': {
			const first = state.lastStageIndex === null;
			const moved = !first && event.stageIndex !== state.lastStageIndex;
			const landed = state.intended !== null && event.stageIndex >= state.intended;
			// A move this device did not ask for, or asked for and was told was
			// stale: the room went on from the other hand
			const elsewhere =
				moved && (!state.advancing || !landed) && (state.intended === null || !state.advancing);
			const failedButLanded = state.failed && landed;

			return {
				...state,
				lastStageIndex: event.stageIndex,
				// The move landed, whoever made it: nothing is in flight any more
				advancing: state.advancing && !landed,
				pressedAt: state.advancing && !landed ? state.pressedAt : null,
				failed: state.failed && !failedButLanded,
				movedElsewhere: state.movedElsewhere || failedButLanded || (elsewhere && !landed),
				intended: landed ? null : state.intended,
			};
		}

		case 'tick':
			if (!state.advancing || state.pressedAt === null) return state;
			if (event.now - state.pressedAt < ADVANCE_TIMEOUT_MS) return state;

			return { ...state, advancing: false, pressedAt: null, failed: true };

		case 'dismiss':
			return state.movedElsewhere ? { ...state, movedElsewhere: false } : state;

		default:
			return state;
	}
}

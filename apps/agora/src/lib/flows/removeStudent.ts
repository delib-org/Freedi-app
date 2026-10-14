/**
 * The Class panel's "remove this student" — pure, so the panel is a renderer
 * and the rules of the confirm live where a test can reach them.
 *
 * One row at a time can be asking "remove X?"; the press goes to the server
 * once (a second tap while it is in flight is ignored); a failure keeps the
 * question open with a line saying so; a success closes it and leaves a quiet
 * "X was removed" for the screen reader and the eye. The row itself vanishes
 * on its own — the participants listener drops the deleted seat — and a row
 * that vanishes while its question is open (removed from the teacher's other
 * device) closes the question instead of leaving it pointing at nobody.
 */
export interface RemoveStudentState {
	/** Whose row is asking "remove?" */
	confirmUid: string | null;
	/** Whose removal is with the server */
	busyUid: string | null;
	errorKey: string | null;
	/** The pseudonym of the last student removed from this screen */
	removedName: string | null;
}

export type RemoveStudentEvent =
	| { kind: 'ask'; uid: string }
	| { kind: 'cancel' }
	| { kind: 'start' }
	| { kind: 'succeeded'; name: string }
	| { kind: 'failed' }
	| { kind: 'roster'; uids: ReadonlySet<string> };

export const REMOVE_FAILED_KEY = 'teacher.remove_failed';

export const INITIAL_REMOVE_STUDENT: RemoveStudentState = {
	confirmUid: null,
	busyUid: null,
	errorKey: null,
	removedName: null,
};

export function removeStudentReduce(
	state: RemoveStudentState,
	event: RemoveStudentEvent,
): RemoveStudentState {
	switch (event.kind) {
		case 'ask':
			// Never swap the question out from under a removal in flight
			if (state.busyUid) return state;

			return { ...state, confirmUid: event.uid, errorKey: null };
		case 'cancel':
			if (state.busyUid) return state;

			return { ...state, confirmUid: null, errorKey: null };
		case 'start':
			if (!state.confirmUid || state.busyUid) return state;

			return { ...state, busyUid: state.confirmUid, errorKey: null };
		case 'succeeded':
			return { confirmUid: null, busyUid: null, errorKey: null, removedName: event.name };
		case 'failed':
			return { ...state, busyUid: null, errorKey: REMOVE_FAILED_KEY };
		case 'roster':
			if (!state.confirmUid || state.busyUid || event.uids.has(state.confirmUid)) return state;

			return { ...state, confirmUid: null, errorKey: null };
	}
}

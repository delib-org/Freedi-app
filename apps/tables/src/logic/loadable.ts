/**
 * The states every live screen shares (IA section 7): loading, error, no
 * permission and ready. "Empty" is a ready state with no items.
 */
export type LoadState = 'loading' | 'ready' | 'error' | 'denied';

/** Firestore error code to screen state: a denied read is "no permission", the rest is "error". */
export function stateForErrorCode(code: string | undefined): 'denied' | 'error' {
	return code === 'permission-denied' || code === 'unauthenticated' ? 'denied' : 'error';
}

/** The worst of several states, so one failing listener decides the screen. */
export function combineStates(states: readonly LoadState[]): LoadState {
	if (states.includes('denied')) return 'denied';
	if (states.includes('error')) return 'error';
	if (states.includes('loading')) return 'loading';

	return 'ready';
}

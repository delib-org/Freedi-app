import { createContext, useContext } from 'react';

export interface FirstRunState {
	/** True while the first-run flow (terms, notifications) is still owed. */
	pending: boolean;
}

export const FirstRunContext = createContext<FirstRunState>({ pending: false });

/** Whether the first-run flow is still covering the page (legacy shell: never). */
export function useFirstRunPending(): boolean {
	return useContext(FirstRunContext).pending;
}

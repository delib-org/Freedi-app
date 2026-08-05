/**
 * The bridge between a "your idea was woven in" celebration and the helped
 * item it talks about. The notification layer knows the proposal id but not
 * the deliberation view's private step state; the view knows how to travel
 * but not when. The view registers a navigator, the celebration requests it.
 */

let navigator: ((proposalId: string) => void) | null = null;

/** The deliberation view plugs in its "travel to this helped proposal" move */
export function registerHelpedNavigator(navigate: (proposalId: string) => void): void {
	navigator = navigate;
}

export function unregisterHelpedNavigator(navigate: (proposalId: string) => void): void {
	// Only the current owner may unregister — a stale unmount must not
	// disconnect the navigator a fresh mount just registered
	if (navigator === navigate) navigator = null;
}

/** No-op when the deliberation view isn't mounted (e.g. stage moved on) */
export function requestHelpedFocus(proposalId: string): void {
	if (navigator) navigator(proposalId);
}

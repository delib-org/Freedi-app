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

/**
 * The mirror bridge: "take me to my workshop, feedback is waiting". The
 * received-improvements toast needs it — a notification that only says
 * where to go, without taking you, is half a notification.
 */
let mineNavigator: (() => void) | null = null;

export function registerMineNavigator(navigate: () => void): void {
	mineNavigator = navigate;
}

export function unregisterMineNavigator(navigate: () => void): void {
	if (mineNavigator === navigate) mineNavigator = null;
}

export function requestMineFocus(): void {
	if (mineNavigator) mineNavigator();
}

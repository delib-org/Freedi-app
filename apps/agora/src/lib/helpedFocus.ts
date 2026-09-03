import type { InboxTarget } from './inbox';

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

/**
 * The third bridge: "your idea slot is free — another stall?". A decline
 * re-arms the helper's idea slot, and the toast that says so must be able to
 * WALK them back into the market instead of leaving the invitation as words.
 */
let marketNavigator: (() => void) | null = null;

export function registerMarketNavigator(navigate: () => void): void {
	marketNavigator = navigate;
}

export function unregisterMarketNavigator(navigate: () => void): void {
	if (marketNavigator === navigate) marketNavigator = null;
}

export function requestMarketFocus(): void {
	if (marketNavigator) marketNavigator();
}

/**
 * The fourth bridge: "open THIS conversation". The inbox and the toasts point
 * at a specific thread — a classmate's reply is not news about the game in
 * general, it is a sentence someone wrote in one place.
 */
let threadNavigator: ((proposalId: string, helperUid: string) => void) | null = null;

export function registerThreadNavigator(
	navigate: (proposalId: string, helperUid: string) => void,
): void {
	threadNavigator = navigate;
}

export function unregisterThreadNavigator(
	navigate: (proposalId: string, helperUid: string) => void,
): void {
	if (threadNavigator === navigate) threadNavigator = null;
}

/**
 * The fifth bridge: "your teacher wrote to you". The thread sheet lives on
 * the game controller, so it is reachable from every stage — a note about
 * language must be readable on the scene screen it was sent during.
 */
let teacherNavigator: (() => void) | null = null;

export function registerTeacherNavigator(navigate: () => void): void {
	teacherNavigator = navigate;
}

export function unregisterTeacherNavigator(navigate: () => void): void {
	if (teacherNavigator === navigate) teacherNavigator = null;
}

export function requestTeacherFocus(): void {
	if (teacherNavigator) teacherNavigator();
}

/**
 * Send the student to whatever a piece of news is ABOUT. One dispatcher, so
 * the toast and the inbox row that carry the same target can never disagree
 * about where it leads.
 */
export function requestFocus(target: InboxTarget): void {
	switch (target.kind) {
		case 'thread':
			if (threadNavigator) threadNavigator(target.proposalId, target.helperUid);
			else requestHelpedFocus(target.proposalId);
			break;
		case 'helped':
			requestHelpedFocus(target.proposalId);
			break;
		case 'market':
			requestMarketFocus();
			break;
		case 'teacher':
			requestTeacherFocus();
			break;
		default:
			requestMineFocus();
	}
}

/**
 * A light emphasis on whatever a deep link just landed on: a soft ring that
 * pulses twice and leaves. Without it a student who followed a message lands
 * on a screenful of rows with no idea which one they were promised.
 */
export function emphasise(element: Element | null): void {
	if (!element) return;
	element.classList.remove('is-emphasised');
	// Reflow, so a second visit to the same element replays the animation
	void (element as HTMLElement).offsetWidth;
	element.classList.add('is-emphasised');
	window.setTimeout(() => element.classList.remove('is-emphasised'), 2600);
}

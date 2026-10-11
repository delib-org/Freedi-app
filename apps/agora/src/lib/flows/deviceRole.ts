/**
 * Which of the teacher's screens may show real names.
 *
 * The rules let the teacher's account read the names on any device; the
 * leak to guard against is the laptop on the wall. So every device the
 * console opens on declares a role: PRIVATE (the phone in the teacher's
 * hand — names, the students' private words) or WALL (projected — nothing
 * a student should not see). A phone-sized touch screen is private without
 * asking; anything else is asked once, and until it answers it is treated
 * as a wall, so no name is fetched, let alone drawn, before the answer.
 *
 * This is a UI guard, not a security boundary: the account can read the
 * names either way. What makes it hold is that a wall never subscribes to
 * them (see lib/teacherConsole.ts), so a stale cache cannot leak either.
 */
export type DeviceRole = 'private' | 'wall';

export interface DeviceRoleInput {
	/** The role this device chose before, if any */
	stored: DeviceRole | null;
	/** `(pointer: coarse)` — a finger, not a mouse */
	coarsePointer: boolean;
	viewportWidth: number;
	/** The lesson collects real names at all (not a civic square, not switched off) */
	namesCollected: boolean;
}

export interface DeviceRoleDecision {
	role: DeviceRole;
	/** Show the "where is this screen?" sheet before anything with names renders */
	ask: boolean;
}

/** Wider than this, a touch screen is a tablet on a stand, not a phone in a hand */
export const PHONE_MAX_WIDTH = 600;

export function decideDeviceRole(input: DeviceRoleInput): DeviceRoleDecision {
	// Nothing to hide: the console is what it always was
	if (!input.namesCollected) return { role: 'private', ask: false };
	if (input.stored) return { role: input.stored, ask: false };
	if (input.coarsePointer && input.viewportWidth <= PHONE_MAX_WIDTH) {
		return { role: 'private', ask: false };
	}

	// Unanswered = wall: the safe default is the one that cannot leak
	return { role: 'wall', ask: true };
}

/**
 * On a wall NEXT takes two taps: a stray touch on a projected laptop (a
 * student leaning on it, an Enter on the way to something else) must not
 * open the next station for the whole class.
 */
export function nextNeedsArming(role: DeviceRole): boolean {
	return role === 'wall';
}

/** How long an armed NEXT waits for its second tap */
export const ARM_MS = 3000;

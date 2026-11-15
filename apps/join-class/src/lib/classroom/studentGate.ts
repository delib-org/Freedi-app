import type { StatementSubscription } from '@freedi/shared-types';
import { needsNameForm } from './nameGate';

/**
 * Which screen stands in front of a student's steps (IA tables-class-bridge 7):
 *  - 'name'        the ordinary name form (an ordinary lesson, or the teacher asked for a new name);
 *  - 'registered'  a connected lesson's "full name, as registered" gate: walk-ins MUST come in
 *                  through `classArriveByName`, never the old join;
 *  - 'seat-moved'  another device took this seat ("הדיון ממשיך במכשיר אחר");
 *  - 'none'        the steps.
 */
export type StudentGate = 'none' | 'name' | 'registered' | 'seat-moved';

export interface StudentGateInput {
	/** The lesson is connected to a registration. */
	connected: boolean;
	user: { displayName?: string | null; isAnonymous?: boolean } | null;
	deviceName: string | null;
	sub: Pick<StatementSubscription, 'user' | 'renameRequested' | 'seatMovedAt'> | null;
	subLoaded: boolean;
	/** The student pressed "come in again from here" (or "pick my table"): the gate is open on purpose. */
	reenter: boolean;
}

export function studentGateOf(input: StudentGateInput): StudentGate {
	const { connected, user, sub, subLoaded } = input;
	if (!connected) {
		return needsNameForm({ user, deviceName: input.deviceName, sub, subLoaded }) ? 'name' : 'none';
	}
	if (!user) return 'none';
	// The teacher asked for a new name: the ordinary form answers it.
	if (sub?.renameRequested === true) return 'name';
	if (!subLoaded) return 'none';
	if (input.reenter) return 'registered';
	if (typeof sub?.seatMovedAt === 'number') return 'seat-moved';

	// No subscription yet (walk-in: nothing is joined without the gate) or one with no name.
	return sub?.user?.displayName?.trim() ? 'none' : 'registered';
}

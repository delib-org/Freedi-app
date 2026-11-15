import type { ClassArrival } from '@freedi/shared-types';
import { classSeatByCode } from './api';
import { registrationReasonOf } from './registrationLogic';

/**
 * The personal link (`/seat/:seatCode`, IA tables-class-bridge 5.1): the code is
 * exchanged on the server for the lesson and the seat, and the route is replaced
 * with `/m/:lessonId`, so "back" never returns to the code.
 */

export type SeatOutcome =
	/** Landed: open the lesson (the name is the registration's full name). */
	| { kind: 'go'; href: string; fullName: string }
	/** Unknown, cancelled, ended or disconnected: one answer for all. */
	| { kind: 'inactive' }
	/** No network or a failed call: say so and offer a retry. */
	| { kind: 'offline' };

/** Where a landed arrival goes. */
export function lessonHrefOf(mainId: string): string {
	return `/m/${encodeURIComponent(mainId)}`;
}

export function outcomeOfArrival(arrival: ClassArrival): SeatOutcome {
	return { kind: 'go', href: lessonHrefOf(arrival.mainId), fullName: arrival.fullName };
}

/** A dead link is `not-found` with reason `seat-link-inactive`; anything else is a failed call. */
export function outcomeOfError(error: unknown): SeatOutcome {
	return registrationReasonOf(error) === 'seat-link-inactive'
		? { kind: 'inactive' }
		: { kind: 'offline' };
}

/** Exchange the code. Never throws: the three outcomes are the screen's states. */
export async function exchangeSeatCode(rawCode: string | undefined): Promise<SeatOutcome> {
	const seatCode = rawCode?.trim() ?? '';
	if (!seatCode) return { kind: 'inactive' };
	try {
		return outcomeOfArrival(await classSeatByCode({ seatCode }));
	} catch (error) {
		return outcomeOfError(error);
	}
}

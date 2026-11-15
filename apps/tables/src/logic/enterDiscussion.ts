import type { TableAssignment } from '@freedi/shared-types';
import { classifyError } from '@/logic/callableErrors';

/**
 * "כניסה לדיון": the way from My table into the connected Class lesson. The
 * button is offered once the tables are published and a lesson uses the session.
 */
export function offersEntry(
	session: Pick<TableAssignment, 'contextStatementId' | 'status'>,
): boolean {
	return Boolean(session.contextStatementId) && session.status === 'published';
}

/**
 * What a failed seat-link request means for the screen. A refusal (not
 * connected, not registered, session ended) is the server saying there is
 * nothing to enter, so the button is simply absent. Anything else is a link
 * that could not be made: the person is told to use the class code instead.
 */
export type SeatLinkFailure = 'hidden' | 'failed';

export function seatLinkFailure(error: unknown): SeatLinkFailure {
	return classifyError(error) === 'failedPrecondition' ? 'hidden' : 'failed';
}

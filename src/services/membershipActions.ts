import { approveMembership, returnToWaiting } from '@/controllers/db/membership/setMembership';
import { WaitingMember } from '@freedi/shared-types';

/**
 * Decisions on people waiting to join. Each function runs one write per
 * person and resolves with the people whose write failed, so the caller can
 * put exactly those rows back. Confirmation is the caller's job (UX spec 4.3:
 * Undo for reversible actions, a dialog only for bulk Decline).
 */
async function settle(
	members: ReadonlyArray<WaitingMember>,
	write: (member: WaitingMember) => Promise<void>,
): Promise<WaitingMember[]> {
	const results = await Promise.allSettled(members.map((member) => write(member)));

	return members.filter((_, index) => results[index].status === 'rejected');
}

/** Let in: the person becomes a member. */
export function approveMultiple(members: ReadonlyArray<WaitingMember>): Promise<WaitingMember[]> {
	return settle(members, (member) => approveMembership(member, true));
}

/** Decline: the person is blocked in this space (role banned), as before. */
export function rejectMultiple(members: ReadonlyArray<WaitingMember>): Promise<WaitingMember[]> {
	return settle(members, (member) => approveMembership(member, false));
}

/** Undo of either decision: back on the waiting list. */
export function returnMultipleToWaiting(
	members: ReadonlyArray<WaitingMember>,
): Promise<WaitingMember[]> {
	return settle(members, returnToWaiting);
}

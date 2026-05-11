/**
 * Typed callable wrappers for the delegate-management Cloud Functions.
 * Kept separate from the subscription module so callers can import the
 * action they need without pulling in the listener machinery.
 */

import { functions, httpsCallable } from '../firebase';

interface CreateInviteResult {
	inviteLink: string;
	invitationId: string;
}

/**
 * Create a new delegate invitation. Returns the shareable link the admin
 * can copy to clipboard. Email is sent server-side by a Firestore trigger.
 * Caller is responsible for surfacing the result (success toast / error).
 */
export async function createJoinDelegateInvite(args: {
	questionId: string;
	email: string;
	canManageOrganizer: boolean;
	canManageParticipant: boolean;
}): Promise<CreateInviteResult> {
	const call = httpsCallable<typeof args, CreateInviteResult>(
		functions,
		'fn_createJoinDelegateInvite',
	);
	const result = await call(args);

	return result.data;
}

/**
 * Revoke a pending invitation (mode 1) or remove an active delegate
 * (mode 2). Both modes idempotent — calling twice is a no-op.
 */
export async function revokeJoinDelegate(
	args: { invitationId: string } | { questionId: string; userId: string },
): Promise<void> {
	const call = httpsCallable<typeof args, { ok: true }>(functions, 'fn_revokeJoinDelegate');
	await call(args);
}

/**
 * Accept a delegate invitation by token. Used by the AcceptInvite view;
 * surfaces the callable in a typed wrapper so the view doesn't reach into
 * firebase.ts directly.
 */
export async function acceptJoinDelegateInvite(token: string): Promise<{
	questionId: string;
	permissions: { canManageOrganizerSolutions: boolean; canManageParticipantSolutions: boolean };
}> {
	const call = httpsCallable<
		{ token: string },
		{
			questionId: string;
			permissions: {
				canManageOrganizerSolutions: boolean;
				canManageParticipantSolutions: boolean;
			};
		}
	>(functions, 'fn_acceptJoinDelegateInvite');
	const result = await call({ token });

	return result.data;
}

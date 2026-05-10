import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { randomBytes } from 'crypto';
import {
	Collections,
	JOIN_DELEGATE_INVITE_EXPIRY_MS,
	JoinDelegateInvitation,
	JoinDelegateInvitationStatus,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { assertJoinAdminAuthorized } from '../../utils/joinAuth';

interface CreateJoinDelegateInviteRequest {
	questionId: string;
	email: string;
	canManageOrganizer: boolean;
	canManageParticipant: boolean;
}

interface CreateJoinDelegateInviteResult {
	inviteLink: string;
	invitationId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getJoinAppBaseUrl(): string {
	const explicit = process.env.JOIN_APP_BASE_URL;
	if (explicit) return explicit.replace(/\/+$/, '');

	// Fall back to the same domain logic used by createStatementEmailTemplate.
	const currentDomain = process.env.DOMAIN || process.env.FUNCTION_TARGET;
	switch (currentDomain) {
		case 'freedi-test.web.app':
			return 'https://freedi-test.web.app/join';
		case 'localhost':
			return 'http://localhost:5174';
		default:
			return 'https://freedi.tech/join';
	}
}

/**
 * Question admin issues an invite for a trusted user to delegate solution-
 * editing rights on a single question. The invite is identified by a secret
 * 256-bit token (URL-safe base64) that ships in the link the admin shares.
 *
 * Authorization: caller must be the question's `creatorId` OR hold an
 * `admin` / `statement-creator` subscription. Mirrors the same auth check
 * used by `createOrganizerSuggestion`.
 */
export const fn_createJoinDelegateInvite = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<CreateJoinDelegateInviteRequest>,
	): Promise<CreateJoinDelegateInviteResult> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { questionId, email, canManageOrganizer, canManageParticipant } = request.data ?? {};

		if (!questionId || typeof questionId !== 'string') {
			throw new HttpsError('invalid-argument', 'questionId is required');
		}
		const normalizedEmail = (email ?? '').trim().toLowerCase();
		if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
			throw new HttpsError('invalid-argument', 'A valid email is required');
		}
		if (!canManageOrganizer && !canManageParticipant) {
			throw new HttpsError(
				'invalid-argument',
				'Choose at least one permission (organizer or participant)',
			);
		}

		// Reject self-invite — confusing UX and serves no purpose since the
		// question creator is already an admin.
		const callerEmail = (request.auth?.token as { email?: string } | undefined)?.email;
		if (callerEmail && callerEmail.trim().toLowerCase() === normalizedEmail) {
			throw new HttpsError('failed-precondition', 'You cannot invite yourself');
		}

		// Load question + authorize. allowDelegate is FALSE because letting a
		// delegate invite further delegates would be a privilege-escalation
		// surface — only the question creator and admin/creator subscribers
		// can grow the delegate pool.
		await assertJoinAdminAuthorized({
			uid,
			questionId,
			allowDelegate: false,
			operation: 'joinDelegate.createInvite',
		});

		const token = randomBytes(32).toString('base64url');
		const tokenName = (request.auth?.token as { name?: string } | undefined)?.name ?? '';
		const inviterDisplayName = tokenName.trim() || 'A facilitator';
		const now = Date.now();

		const invitationRef = db.collection(Collections.joinDelegateInvitations).doc();
		const invitation: JoinDelegateInvitation = {
			invitationId: invitationRef.id,
			questionId,
			invitedEmail: normalizedEmail,
			invitedBy: uid,
			invitedByDisplayName: inviterDisplayName,
			permissions: {
				canManageOrganizerSolutions: !!canManageOrganizer,
				canManageParticipantSolutions: !!canManageParticipant,
			},
			token,
			status: JoinDelegateInvitationStatus.pending,
			createdAt: now,
			expiresAt: now + JOIN_DELEGATE_INVITE_EXPIRY_MS,
			acceptedAt: null,
			acceptedByUserId: null,
		};

		await invitationRef.set(invitation);

		const inviteLink = `${getJoinAppBaseUrl()}/invite?token=${encodeURIComponent(token)}`;

		logger.info('[fn_createJoinDelegateInvite] Invitation created', {
			invitationId: invitation.invitationId,
			questionId,
			invitedEmail: normalizedEmail,
			canManageOrganizer,
			canManageParticipant,
		});

		return { inviteLink, invitationId: invitation.invitationId };
	},
);

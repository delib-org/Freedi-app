import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	JoinDelegateInvitation,
	Statement,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { getEmailTransporter } from '../../utils/emailTransporter';
import { createJoinDelegateInvitationEmail } from '../../email-templates';

function getJoinAppBaseUrl(): string {
	const explicit = process.env.JOIN_APP_BASE_URL;
	if (explicit) return explicit.replace(/\/+$/, '');

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
 * Sends the invitation email when a new `joinDelegateInvitations` document
 * appears. The token in the document is the canonical secret — we re-derive
 * the link here rather than store the URL so the link survives a domain
 * change. If `EMAIL_USER`/`EMAIL_PASSWORD` are missing, we log and skip; the
 * admin can still copy the link manually from the DelegatesPanel UI.
 */
export const fn_onJoinDelegateInvitationCreated = onDocumentCreated(
	{
		document: `${Collections.joinDelegateInvitations}/{invitationId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const snapshot = event.data;
		if (!snapshot) {
			logger.warn('[fn_onJoinDelegateInvitationCreated] No snapshot data');

			return;
		}

		const invitation = snapshot.data() as JoinDelegateInvitation;
		if (!invitation?.token || !invitation?.invitedEmail) {
			logger.warn('[fn_onJoinDelegateInvitationCreated] Malformed invitation, skipping email', {
				invitationId: invitation?.invitationId,
			});

			return;
		}

		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn(
				'[fn_onJoinDelegateInvitationCreated] No transporter — skipping email send. ' +
					'Admin can still copy the link from the panel.',
				{ invitationId: invitation.invitationId },
			);

			return;
		}

		// Resolve the question title for the email body.
		let questionTitle = '';
		try {
			const qSnap = await db.collection(Collections.statements).doc(invitation.questionId).get();
			if (qSnap.exists) {
				const question = qSnap.data() as Statement;
				questionTitle = (question?.statement ?? '').trim();
			}
		} catch (error) {
			logger.warn('[fn_onJoinDelegateInvitationCreated] Failed to load question for title', {
				invitationId: invitation.invitationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		const inviteLink = `${getJoinAppBaseUrl()}/invite?token=${encodeURIComponent(invitation.token)}`;

		const html = createJoinDelegateInvitationEmail({
			inviterName: invitation.invitedByDisplayName,
			questionTitle: questionTitle || 'a Freedi question',
			canManageOrganizer: invitation.permissions.canManageOrganizerSolutions,
			canManageParticipant: invitation.permissions.canManageParticipantSolutions,
			inviteLink,
			expiresAtMs: invitation.expiresAt,
		});

		try {
			await transporter.sendMail({
				from: process.env.EMAIL_USER,
				to: invitation.invitedEmail,
				subject: `${invitation.invitedByDisplayName} invited you to help on Freedi`,
				html,
				text:
					`${invitation.invitedByDisplayName} invited you to help edit solutions on Freedi.\n\n` +
					`Accept the invite: ${inviteLink}\n\n` +
					`This link expires on ${new Date(invitation.expiresAt).toUTCString()}.`,
			});

			logger.info('[fn_onJoinDelegateInvitationCreated] Invitation email sent', {
				invitationId: invitation.invitationId,
				invitedEmail: invitation.invitedEmail,
			});
		} catch (error) {
			logger.error('[fn_onJoinDelegateInvitationCreated] Failed to send invitation email', {
				invitationId: invitation.invitationId,
				invitedEmail: invitation.invitedEmail,
				error: error instanceof Error ? error.message : String(error),
			});
			// Don't rethrow — the doc still exists, admin can still copy the link.
		}
	},
);

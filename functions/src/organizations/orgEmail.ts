import { logger } from 'firebase-functions/v1';
import { Collections, Organization, OrganizationInvitation } from '@freedi/shared-types';
import { db } from '../db';
import { getEmailTransporter } from '../utils/emailTransporter';
import { createOrganizationInvitationEmail } from '../email-templates';
import { buildInviteLink } from './orgInvites';

export type InvitationEmailLanguage = 'he' | 'en';

interface SendOrgInvitationEmailInput {
	invitation: OrganizationInvitation;
	rawToken: string;
	/** Skips the `organizations/{id}` lookup when the caller already has it. */
	language?: InvitationEmailLanguage;
}

function toEmailLanguage(code: string | undefined): InvitationEmailLanguage {
	return code?.toLowerCase().startsWith('he') ? 'he' : 'en';
}

async function resolveLanguage(organizationId: string): Promise<InvitationEmailLanguage> {
	try {
		const snap = await db.collection(Collections.organizations).doc(organizationId).get();
		if (!snap.exists) return 'en';

		return toEmailLanguage((snap.data() as Organization).defaultLanguage);
	} catch (error) {
		logger.warn('[orgEmail] Failed to load organization language, defaulting to en', {
			organizationId,
			error: error instanceof Error ? error.message : String(error),
		});

		return 'en';
	}
}

/**
 * Best-effort invitation email. The raw token exists only in the callable
 * that minted it (the document stores its hash), so this MUST be called from
 * that callable rather than a Firestore trigger. Never throws — a failed or
 * skipped email leaves the invite usable via the link shown in Studio.
 * Resolves `true` when a message was handed to the transporter.
 */
export async function sendOrgInvitationEmail({
	invitation,
	rawToken,
	language,
}: SendOrgInvitationEmailInput): Promise<boolean> {
	try {
		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn('[orgEmail] No transporter — skipping invitation email', {
				invitationId: invitation.invitationId,
			});

			return false;
		}

		const lang = language ?? (await resolveLanguage(invitation.organizationId));
		const inviteLink = buildInviteLink(rawToken);
		const html = createOrganizationInvitationEmail({
			organizationName: invitation.organizationName,
			inviterName: invitation.invitedByDisplayName,
			role: invitation.role,
			inviteLink,
			language: lang,
		});
		const subject =
			lang === 'he'
				? `הוזמנת להצטרף לארגון ${invitation.organizationName} ב-WizCol Studio`
				: `You're invited to join ${invitation.organizationName} on WizCol Studio`;
		const text =
			lang === 'he'
				? `${invitation.invitedByDisplayName} הזמין/ה אותך להצטרף לארגון ${invitation.organizationName} בתפקיד ${invitation.role}.\n\nלאישור ההזמנה: ${inviteLink}\n\nהקישור תקף עד ${new Date(invitation.expiresAt).toUTCString()}.`
				: `${invitation.invitedByDisplayName} invited you to join ${invitation.organizationName} as ${invitation.role}.\n\nAccept the invite: ${inviteLink}\n\nThis link expires on ${new Date(invitation.expiresAt).toUTCString()}.`;

		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to: invitation.invitedEmail,
			subject,
			html,
			text,
		});

		logger.info('[orgEmail] Invitation email sent', {
			invitationId: invitation.invitationId,
			invitedEmail: invitation.invitedEmail,
		});

		return true;
	} catch (error) {
		logger.error('[orgEmail] Failed to send invitation email', {
			invitationId: invitation.invitationId,
			invitedEmail: invitation.invitedEmail,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

import { email, maxLength, number, object, optional, picklist, pipe, string, InferOutput } from 'valibot';

/**
 * A pending invitation for someone to teach in a school, filed when a
 * sys-admin attaches a teacher by email and no account has that email yet.
 * When that person signs in to Agora with Google and their VERIFIED email
 * matches, the server attaches them to the school and marks the invite
 * accepted (functions/src/agora/teacherInvites.ts).
 *
 * Doc id: `agoraTeacherInviteId(schoolId, emailHash)` — one invite per
 * normalized email per school, so a second "attach" re-sends rather than
 * duplicates. Server-written only. Readable only by system admins (it holds
 * an email address). Timestamps in ms.
 */

export const AGORA_TEACHER_INVITE = {
	MAX_EMAIL_LENGTH: 254,
	/** Invites one school lists at most */
	LIST_LIMIT: 200,
} as const;

export const AgoraTeacherInviteStatusSchema = picklist(['pending', 'accepted']);
export type AgoraTeacherInviteStatus = InferOutput<typeof AgoraTeacherInviteStatusSchema>;

export const AgoraTeacherInviteSchema = object({
	inviteId: string(),
	schoolId: string(),
	/** Lower-cased and trimmed */
	email: pipe(string(), email(), maxLength(AGORA_TEACHER_INVITE.MAX_EMAIL_LENGTH)),
	status: AgoraTeacherInviteStatusSchema,
	/** The sys-admin who invited */
	invitedBy: string(),
	/** When the email was last sent (or tried) */
	lastSentAt: number(),
	sendCount: number(),
	acceptedAt: optional(number()),
	acceptedBy: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraTeacherInvite = InferOutput<typeof AgoraTeacherInviteSchema>;

/** The one normal form of an invited email: trimmed, lower-cased */
export function normalizeInviteEmail(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * The invite's doc id from the school and a hash of the normalized email
 * (callers hash; emails may hold characters a doc id may not).
 */
export function agoraTeacherInviteId(schoolId: string, emailHash: string): string {
	return `${schoolId}--${emailHash}`;
}

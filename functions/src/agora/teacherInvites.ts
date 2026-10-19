import { createHash } from 'crypto';
import type { DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
	AGORA_TEACHER_INVITE,
	AgoraSchool,
	AgoraTeacherInvite,
	Collections,
	agoraTeacherInviteId,
	normalizeInviteEmail,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { attachTeacherUpdate, writeGrant } from './approvalGrant';
import { findUidByEmail } from './teacherLookup';
import { sendTeacherInviteEmail } from './teacherInviteEmail';

/**
 * Adding a school's teacher by email ALWAYS works now (Tal, 2026-10-19):
 *
 *   - an account has the email → attached at once (as before) and told so;
 *   - nobody has it yet → a pending invite `agoraTeacherInvites/{schoolId--hash}`
 *     is filed and the person is emailed "sign in with Google using this
 *     address". When they do, {@link claimTeacherInvites} (run by
 *     `agoraRequestAccess {status}`, the call Agora's teacher room makes on
 *     every sign-in) attaches them and marks the invite accepted.
 *
 * Only sys-admins reach these (agoraAdminManageSchool checks before calling);
 * clients cannot write invites, and only sys-admins may read them (rules).
 *
 * SECURITY: an invite is claimed only on a Google sign-in whose email the
 * provider VERIFIED — anyone can type any address into an unverified account.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Hex chars of the sha256 kept in the doc id: plenty against collision, short ids */
const EMAIL_HASH_LENGTH = 40;

/** The normalized email, or an `invalid-argument` refusal */
export function cleanInviteEmail(value: unknown): string {
	const email = typeof value === 'string' ? normalizeInviteEmail(value) : '';
	if (
		!email ||
		email.length > AGORA_TEACHER_INVITE.MAX_EMAIL_LENGTH ||
		!EMAIL_PATTERN.test(email)
	) {
		throw new HttpsError('invalid-argument', 'A valid teacherEmail is required');
	}

	return email;
}

export function inviteRefFor(schoolId: string, email: string): DocumentReference {
	const hash = createHash('sha256').update(email).digest('hex').slice(0, EMAIL_HASH_LENGTH);

	return db.collection(Collections.agoraTeacherInvites).doc(agoraTeacherInviteId(schoolId, hash));
}

export interface AddTeacherResult {
	teacherUid?: string;
	invited: boolean;
	emailSent: boolean;
}

/**
 * The panel's "attach teacher": attach the account that has this email, or
 * invite the email. Either way the person gets a letter.
 */
export async function addTeacherByEmail(params: {
	schoolRef: DocumentReference;
	school: AgoraSchool;
	rawEmail: unknown;
	adminUid: string;
}): Promise<AddTeacherResult> {
	const { schoolRef, school, adminUid } = params;
	const email = cleanInviteEmail(params.rawEmail);
	const teacherUid = await findUidByEmail(email);
	const inviteRef = inviteRefFor(school.schoolId, email);
	const now = Date.now();
	const context = { schoolId: school.schoolId };

	if (teacherUid) {
		// A sys-admin attaching someone IS an approval, so the grant is written too
		await schoolRef.update(attachTeacherUpdate(teacherUid, now));
		await writeGrant(
			teacherUid,
			{ source: 'assigned', grantedAt: now, grantedBy: adminUid },
			'school',
		);
		// An invite still pending for this address here is answered by this attach
		const inviteSnap = await inviteRef.get();
		if ((inviteSnap.data() as AgoraTeacherInvite | undefined)?.status === 'pending') {
			await inviteRef.update({
				status: 'accepted',
				acceptedAt: now,
				acceptedBy: teacherUid,
				lastUpdate: now,
			});
		}
		const emailSent = await sendTeacherInviteEmail(
			{ kind: 'added', schoolName: school.name, email },
			{ ...context, kind: 'added' },
		);

		return { teacherUid, invited: false, emailSent };
	}

	if (school.status !== 'active') {
		throw new HttpsError('failed-precondition', 'Teachers can only be invited to an active school');
	}
	const existing = (await inviteRef.get()).data() as AgoraTeacherInvite | undefined;
	if (existing?.status === 'pending') {
		// Inviting the same address again re-sends: one invite per email per school
		await inviteRef.update({
			invitedBy: adminUid,
			lastSentAt: now,
			sendCount: (existing.sendCount ?? 0) + 1,
			lastUpdate: now,
		});
	} else {
		const invite: AgoraTeacherInvite = {
			inviteId: inviteRef.id,
			schoolId: school.schoolId,
			email,
			status: 'pending',
			invitedBy: adminUid,
			lastSentAt: now,
			sendCount: 1,
			createdAt: now,
			lastUpdate: now,
		};
		await inviteRef.set(invite);
	}
	const emailSent = await sendTeacherInviteEmail(
		{ kind: 'invite', schoolName: school.name, email },
		{ ...context, kind: 'invite' },
	);

	return { invited: true, emailSent };
}

/** Send a pending invite's letter again. `not-found` when there is no pending invite. */
export async function resendTeacherInvite(params: {
	school: AgoraSchool;
	rawEmail: unknown;
	adminUid: string;
}): Promise<{ emailSent: boolean }> {
	const { school, adminUid } = params;
	const email = cleanInviteEmail(params.rawEmail);
	const inviteRef = inviteRefFor(school.schoolId, email);
	const invite = (await inviteRef.get()).data() as AgoraTeacherInvite | undefined;
	if (invite?.status !== 'pending') {
		throw new HttpsError('not-found', 'No pending invite for that email at this school');
	}
	const now = Date.now();
	await inviteRef.update({
		invitedBy: adminUid,
		lastSentAt: now,
		sendCount: (invite.sendCount ?? 0) + 1,
		lastUpdate: now,
	});
	const emailSent = await sendTeacherInviteEmail(
		{ kind: 'invite', schoolName: school.name, email },
		{ schoolId: school.schoolId, kind: 'resend' },
	);

	return { emailSent };
}

/** Delete a pending invite. Returns whether there was one. */
export async function cancelTeacherInvite(schoolId: string, rawEmail: unknown): Promise<boolean> {
	const email = cleanInviteEmail(rawEmail);
	const inviteRef = inviteRefFor(schoolId, email);
	const invite = (await inviteRef.get()).data() as AgoraTeacherInvite | undefined;
	if (invite?.status !== 'pending') return false;
	await inviteRef.delete();

	return true;
}

/** The parts of a decoded ID token the claim reads */
export interface InviteClaimToken {
	email?: unknown;
	email_verified?: unknown;
	firebase?: { sign_in_provider?: unknown };
}

/** The verified Google email of a sign-in, or null when it may not claim anything */
export function claimableEmail(token: InviteClaimToken | undefined): string | null {
	if (!token || token.email_verified !== true) return null;
	if (token.firebase?.sign_in_provider !== 'google.com') return null;
	if (typeof token.email !== 'string') return null;
	const email = normalizeInviteEmail(token.email);

	return EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Attach the signed-in person to every school with a pending invite for their
 * verified Google email, and mark those invites accepted. Idempotent: an
 * accepted invite is never claimed twice, and the attach itself is a set
 * union. An invite to a school that has since closed stays pending. Returns
 * the schools joined. Never throws — a failed claim must not lock the
 * teacher out of the screen that reads their status.
 */
export async function claimTeacherInvites(
	uid: string,
	token: InviteClaimToken | undefined,
): Promise<string[]> {
	const email = claimableEmail(token);
	if (!email) return [];

	try {
		const snaps = await db
			.collection(Collections.agoraTeacherInvites)
			.where('email', '==', email)
			.get();
		const pending = snaps.docs
			.map((snap) => snap.data() as AgoraTeacherInvite)
			.filter((invite) => invite.status === 'pending');
		const joined: string[] = [];
		for (const candidate of pending) {
			const inviteRef = db.collection(Collections.agoraTeacherInvites).doc(candidate.inviteId);
			const schoolRef = db.collection(Collections.agoraSchools).doc(candidate.schoolId);
			const claimed = await db.runTransaction(async (tx) => {
				const [inviteSnap, schoolSnap] = await tx.getAll(inviteRef, schoolRef);
				const invite = inviteSnap.data() as AgoraTeacherInvite | undefined;
				const school = schoolSnap.data() as AgoraSchool | undefined;
				if (invite?.status !== 'pending' || invite.email !== email) return false;
				if (school?.status !== 'active') return false;
				const now = Date.now();
				tx.update(schoolRef, attachTeacherUpdate(uid, now));
				await writeGrant(
					uid,
					{ source: 'assigned', grantedAt: now, grantedBy: invite.invitedBy },
					'school',
					tx,
				);
				tx.update(inviteRef, {
					status: 'accepted',
					acceptedAt: now,
					acceptedBy: uid,
					lastUpdate: now,
				});

				return true;
			});
			if (claimed) joined.push(candidate.schoolId);
		}

		return joined;
	} catch (error) {
		logError(error, { operation: 'agora.claimTeacherInvites', userId: uid });

		return [];
	}
}

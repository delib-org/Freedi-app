import { logger } from 'firebase-functions/v1';
import { SourceApp } from '@freedi/shared-types';
import { getEmailTransporter } from '../utils/emailTransporter';
import { resolveAbsoluteUrl } from '../notifications/notificationEmail';
import { escapeHtml } from './libraryReportEmail';

/**
 * The letter a teacher gets when a sys-admin adds them to a school by email:
 * `invite` when no account has that address yet (sign in with Google using
 * it and you are in), `added` when they already had one (you are in now).
 *
 * Hebrew first, then English, in one message — schools carry no language,
 * the audience is Israeli schools, and this is the pattern of the other
 * Agora letters (accessEmail.ts). The Hebrew block is `dir="rtl"`.
 *
 * Pure builder + best-effort sender: a failed or skipped email never undoes
 * the attachment or the invite; the Studio panel shows the invite and can
 * re-send it.
 */

export type TeacherInviteEmailKind = 'invite' | 'added';

export const TEACHER_INVITE_EMAIL = {
	/** Agora's teacher room (Mithril hash routing) */
	TEACH_ROUTE: '/#!/teach',
	SUBJECT_SCHOOL_MAX: 60,
} as const;

export interface TeacherInviteEmailInput {
	kind: TeacherInviteEmailKind;
	schoolName: string;
	/** The address it goes to — named in the letter so they sign in with that one */
	email: string;
	url: string;
}

export interface TeacherInviteEmail {
	subject: string;
	html: string;
	text: string;
}

/** The Agora address the letter links to, from the project's AGORA_APP_URL */
export function teacherInviteUrl(): string {
	return resolveAbsoluteUrl(SourceApp.AGORA, TEACHER_INVITE_EMAIL.TEACH_ROUTE);
}

/** Subjects are headers: one line, no control characters, bounded */
function subjectSafe(value: string): string {
	const flat = value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return flat.length > TEACHER_INVITE_EMAIL.SUBJECT_SCHOOL_MAX
		? `${flat.slice(0, TEACHER_INVITE_EMAIL.SUBJECT_SCHOOL_MAX)}…`
		: flat;
}

interface Copy {
	subject: string;
	he: string[];
	en: string[];
	linkHe: string;
	linkEn: string;
}

function copyOf(input: TeacherInviteEmailInput): Copy {
	const school = input.schoolName.trim() || '—';
	const subjectSchool = subjectSafe(school);
	if (input.kind === 'invite') {
		return {
			subject: `הוזמנת ללמד ב${subjectSchool} באגורה · You're invited to teach in ${subjectSchool} on Agora`,
			he: [
				'שלום,',
				`הוזמנת ללמד ב${school} באגורה.`,
				`כדי להצטרף, התחבר/י לאגורה עם Google באמצעות הכתובת הזו: ${input.email}`,
				'מיד אחרי ההתחברות תצורף/י לבית הספר כמורה.',
			],
			en: [
				'Hello,',
				`You've been invited to teach in ${school} on Agora.`,
				`To join, sign in to Agora with Google using this address: ${input.email}`,
				"As soon as you sign in, you'll be added to the school as a teacher.",
			],
			linkHe: 'להתחברות לאגורה',
			linkEn: 'Sign in to Agora',
		};
	}

	return {
		subject: `צורפת ל${subjectSchool} באגורה · You were added to ${subjectSchool} on Agora`,
		he: [
			'שלום,',
			`צורפת ל${school} באגורה כמורה.`,
			`אפשר להיכנס לאגורה עם Google באמצעות הכתובת: ${input.email}`,
		],
		en: [
			'Hello,',
			`You were added to ${school} on Agora as a teacher.`,
			`Sign in to Agora with Google using this address: ${input.email}`,
		],
		linkHe: 'לחדר המורים באגורה',
		linkEn: 'Open Agora',
	};
}

export function buildTeacherInviteEmail(input: TeacherInviteEmailInput): TeacherInviteEmail {
	const copy = copyOf(input);
	const url = escapeHtml(input.url);
	const block = (lines: string[], dir: 'rtl' | 'ltr', lang: 'he' | 'en', label: string): string =>
		`<div dir="${dir}" lang="${lang}" style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;text-align:${
			dir === 'rtl' ? 'right' : 'left'
		};">${lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join('')}<p style="margin:16px 0;"><a href="${url}" style="font-weight:bold;">${escapeHtml(
			label,
		)}</a></p></div>`;

	const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="max-width:600px;margin:0 auto;padding:20px;color:#333;">
${block(copy.he, 'rtl', 'he', copy.linkHe)}
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
${block(copy.en, 'ltr', 'en', copy.linkEn)}
</body>
</html>`;

	const text = [
		...copy.he,
		`${copy.linkHe}: ${input.url}`,
		'',
		...copy.en,
		`${copy.linkEn}: ${input.url}`,
		'',
	].join('\n');

	return { subject: copy.subject, html, text };
}

/** Send one letter. Never throws: returns whether it went out. */
export async function sendTeacherInviteEmail(
	input: Omit<TeacherInviteEmailInput, 'url'>,
	context: Record<string, string>,
): Promise<boolean> {
	try {
		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn('[agoraTeacherInvite] No transporter — skipping', context);

			return false;
		}
		const mail = buildTeacherInviteEmail({ ...input, url: teacherInviteUrl() });
		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to: input.email,
			subject: mail.subject,
			html: mail.html,
			text: mail.text,
		});
		logger.info('[agoraTeacherInvite] Sent', context);

		return true;
	} catch (error) {
		logger.error('[agoraTeacherInvite] Failed', {
			...context,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

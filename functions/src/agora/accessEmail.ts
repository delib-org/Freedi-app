import { logger } from 'firebase-functions/v1';
import { AgoraAccessRequest, SourceApp } from '@freedi/shared-types';
import { getEmailTransporter } from '../utils/emailTransporter';
import { resolveAbsoluteUrl } from '../notifications/notificationEmail';
import { getStudioBaseUrl } from '../organizations/orgAuth';
import { applicantInfo } from './accessRequests';

/**
 * Access-request emails, through the repo's one mail path
 * (`utils/emailTransporter.ts`). Best effort: never throws, a skipped or
 * failed email leaves the decision standing (the Agora banner and the Studio
 * list show the same state). Hebrew first, then English, in one message —
 * the request carries no language, and the audience is Israeli schools.
 *
 * Every applicant-typed string is HTML-escaped, and none goes into a subject.
 */

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

interface Mail {
	to: string;
	subject: string;
	he: string[];
	en: string[];
	link: { url: string; he: string; en: string };
}

function render(mail: Mail): { html: string; text: string } {
	const block = (lines: string[], dir: 'rtl' | 'ltr', label: string): string =>
		`<div dir="${dir}" style="font-family:Arial,sans-serif;line-height:1.5">${lines
			.map((line) => `<p>${escapeHtml(line)}</p>`)
			.join('')}<p><a href="${escapeHtml(mail.link.url)}">${escapeHtml(label)}</a></p></div>`;
	const html = `${block(mail.he, 'rtl', mail.link.he)}<hr/>${block(mail.en, 'ltr', mail.link.en)}`;
	const text = [
		...mail.he,
		`${mail.link.he}: ${mail.link.url}`,
		'',
		...mail.en,
		`${mail.link.en}: ${mail.link.url}`,
	].join('\n');

	return { html, text };
}

async function send(mail: Mail, context: Record<string, string>): Promise<boolean> {
	try {
		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn('[agoraAccessEmail] No transporter — skipping', context);

			return false;
		}
		const { html, text } = render(mail);
		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to: mail.to,
			subject: mail.subject,
			html,
			text,
		});
		logger.info('[agoraAccessEmail] Sent', context);

		return true;
	} catch (error) {
		logger.error('[agoraAccessEmail] Failed', {
			...context,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

const ROLE_HE: Record<AgoraAccessRequest['role'], string> = {
	teacher: 'מורה',
	supervisor: 'רכז/ת',
};
const ROLE_EN: Record<AgoraAccessRequest['role'], string> = {
	teacher: 'teacher',
	supervisor: 'regional coordinator',
};

/** To the applicant: approved, or declined (with the reason when one was given) */
export async function sendDecisionEmail(
	request: AgoraAccessRequest,
	decision: 'approved' | 'declined',
	reason?: string,
): Promise<boolean> {
	const person = (await applicantInfo([request.uid])).get(request.uid);
	if (!person?.email) return false;
	const context = { requestId: request.requestId, decision };

	if (decision === 'approved') {
		return send(
			{
				to: person.email,
				subject: 'אושרה הגישה שלך לאגורה · Your Agora access was approved',
				he: [`שלום ${request.fullName},`, `בקשתך לגישה כ${ROLE_HE[request.role]} באגורה אושרה.`],
				en: [
					`Hello ${request.fullName},`,
					`Your request for ${ROLE_EN[request.role]} access to Agora was approved.`,
				],
				link:
					request.role === 'supervisor'
						? {
								url: `${getStudioBaseUrl()}/agora`,
								he: 'כיתות האגורה שלי',
								en: 'My Agora classrooms',
							}
						: {
								url: resolveAbsoluteUrl(SourceApp.AGORA, '/teach'),
								he: 'לחדר המורים',
								en: 'Open Agora',
							},
			},
			context,
		);
	}

	return send(
		{
			to: person.email,
			subject: 'בקשת הגישה שלך לאגורה · Your Agora access request',
			he: [
				`שלום ${request.fullName},`,
				`בקשתך לגישה כ${ROLE_HE[request.role]} באגורה לא אושרה.`,
				...(reason ? [`הסיבה: ${reason}`] : []),
				'אפשר להגיש בקשה חדשה בכל עת.',
			],
			en: [
				`Hello ${request.fullName},`,
				`Your request for ${ROLE_EN[request.role]} access to Agora was declined.`,
				...(reason ? [`Reason: ${reason}`] : []),
				'You may apply again at any time.',
			],
			link: { url: resolveAbsoluteUrl(SourceApp.AGORA, '/teach'), he: 'לאגורה', en: 'Open Agora' },
		},
		context,
	);
}

/** To each coordinator of the request's school: a new teacher request waits for them */
export async function sendNewRequestEmails(
	request: AgoraAccessRequest,
	schoolName: string,
	coordinatorUids: readonly string[],
): Promise<number> {
	if (coordinatorUids.length === 0) return 0;
	const people = await applicantInfo(coordinatorUids);
	const url = `${getStudioBaseUrl()}/agora/requests/${encodeURIComponent(request.requestId)}`;
	let sent = 0;
	for (const uid of coordinatorUids) {
		const email = people.get(uid)?.email;
		if (!email) continue;
		const ok = await send(
			{
				to: email,
				subject: 'בקשת גישה חדשה באגורה · New Agora access request',
				he: [`${request.fullName} מבקש/ת גישה כמורה בבית הספר ${schoolName}.`],
				en: [`${request.fullName} asks for teacher access at ${schoolName}.`],
				link: { url, he: 'לבקשה', en: 'Open the request' },
			},
			{ requestId: request.requestId, coordinatorUid: uid },
		);
		if (ok) sent++;
	}

	return sent;
}

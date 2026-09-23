import { logger } from 'firebase-functions/v1';
import { ODYSSEY_FEEDBACK_DEFAULT_RECIPIENTS, type OdysseyFeedback } from '@freedi/shared-types';
import { getEmailTransporter } from '../utils/emailTransporter';

/**
 * The letter, as it lands in the developers' inbox.
 *
 * Never throws. The feedback document is already on disk by the time this runs,
 * so a mail failure is an operator's problem, not the player's — the caller
 * reports success either way and an operator finds the stragglers by querying
 * `emailed == false`.
 */

const SUBJECT_SNIPPET_MAX = 60;

/**
 * Everything interpolated into the HTML body is player-controlled, and the
 * recipient is us. `fn_feedback.ts` interpolates raw user text into a mail aimed
 * at this same inbox; that is the bug this function exists not to repeat.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Who gets the letter.
 *
 * `ODYSSEY_FEEDBACK_RECIPIENTS` is an override, not the source of truth: an
 * unset, blank, or all-garbage value falls back to both developers, so the
 * feature works with nothing configured — which is the state production is
 * actually in.
 */
export function resolveFeedbackRecipients(): string[] {
	const configured = (process.env.ODYSSEY_FEEDBACK_RECIPIENTS ?? '')
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry) => entry.includes('@'));

	const unique = [...new Set(configured)];

	return unique.length > 0 ? unique : [...ODYSSEY_FEEDBACK_DEFAULT_RECIPIENTS];
}

/** First line of the message, short enough to read in an inbox list. */
function buildSubject(message: string): string {
	const flat = message.replace(/\s+/g, ' ').trim();
	const snippet =
		flat.length === 0
			? '(ללא טקסט)'
			: flat.length > SUBJECT_SNIPPET_MAX
				? `${flat.slice(0, SUBJECT_SNIPPET_MAX)}…`
				: flat;

	// The ASCII prefix is deliberate: it gives a Gmail filter a literal that
	// survives every encoding and forwarding path an RTL subject does not.
	return `[Odyssey] משוב משחק/ת — ${snippet}`;
}

interface ContextRow {
	label: string;
	value: string;
}

function buildContextRows(feedback: OdysseyFeedback): ContextRow[] {
	const { context } = feedback;
	const when = new Date(feedback.createdAt).toLocaleString('he-IL', {
		timeZone: 'Asia/Jerusalem',
	});

	return [
		{
			label: 'משתמש/ת',
			value: `${feedback.displayName ?? '—'} · ${feedback.uid} · ${
				feedback.isAnonymous ? 'ללא חשבון' : 'מחובר/ת'
			}`,
		},
		{ label: 'מסך', value: context.route ?? '—' },
		{ label: 'משחק', value: context.gameId ?? '—' },
		{ label: 'גרסה', value: context.appVersion ?? 'לא ידוע' },
		{
			label: 'דפדפן',
			value:
				[context.viewport, context.language, context.userAgent].filter(Boolean).join(' · ') || '—',
		},
		{ label: 'זמן', value: when },
		{ label: 'מזהה משוב', value: feedback.feedbackId },
	];
}

function buildHtml(feedback: OdysseyFeedback): string {
	const rows = buildContextRows(feedback)
		.map(
			(row) =>
				`<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">${escapeHtml(
					row.label,
				)}</td><td style="padding:4px 0;">${escapeHtml(row.value)}</td></tr>`,
		)
		.join('');

	const replyLine = feedback.email
		? `השיבו למייל הזה כדי לענות ל־<a href="mailto:${escapeHtml(feedback.email)}">${escapeHtml(
				feedback.email,
			)}</a>.`
		: 'לא נמסרה כתובת — אין למי להשיב.';

	return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
	<h2 style="margin:0 0 16px;">⛵ משוב מאודיסיאה ישראלית</h2>
	<div style="background:#f7f7f7;border-inline-start:4px solid #d8aa4b;padding:14px 16px;margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(
		feedback.message,
	).replace(/\n/g, '<br>')}</div>
	<p style="margin:0 0 16px;">${replyLine}</p>
	<h3 style="margin:0 0 8px;font-size:15px;color:#444;">פרטים טכניים</h3>
	<table style="border-collapse:collapse;font-size:13px;color:#333;">${rows}</table>
</body>
</html>`;
}

function buildText(feedback: OdysseyFeedback): string {
	const rows = buildContextRows(feedback)
		.map((row) => `${row.label}: ${row.value}`)
		.join('\n');
	const replyLine = feedback.email
		? `השיבו למייל הזה כדי לענות ל־${feedback.email}.`
		: 'לא נמסרה כתובת — אין למי להשיב.';

	return `משוב מאודיסיאה ישראלית\n\n${feedback.message}\n\n${replyLine}\n\nפרטים טכניים\n${rows}\n`;
}

/** Resolves `true` when the message was handed to the transporter. */
export async function sendOdysseyFeedbackEmail(feedback: OdysseyFeedback): Promise<boolean> {
	try {
		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn('[odysseyFeedback] No transporter — letter stored but not emailed', {
				feedbackId: feedback.feedbackId,
			});

			return false;
		}

		await transporter.sendMail({
			// Always our own account. Putting the player's address in `from` spoofs
			// the Gmail account that also sends org invites and digests, and would
			// cost it DMARC reputation.
			from: process.env.EMAIL_USER,
			to: resolveFeedbackRecipients(),
			// Only when they gave one, so a reply to a letter sent without an
			// address bounces back to us rather than to a fiction.
			...(feedback.email ? { replyTo: feedback.email } : {}),
			subject: buildSubject(feedback.message),
			html: buildHtml(feedback),
			text: buildText(feedback),
		});

		logger.info('[odysseyFeedback] Letter emailed', { feedbackId: feedback.feedbackId });

		return true;
	} catch (error) {
		logger.error('[odysseyFeedback] Failed to email letter', {
			feedbackId: feedback.feedbackId,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

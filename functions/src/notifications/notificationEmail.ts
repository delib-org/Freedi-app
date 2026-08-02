/**
 * Shared notification email sender. Builds a branded HTML email with an absolute
 * deep link and sends it via the configured nodemailer transporter
 * (`EMAIL_USER`/`EMAIL_PASSWORD`/`EMAIL_SERVICE`). Used by both the engagement
 * channel router and the per-reply chat fan-out.
 *
 * Degrades gracefully: if credentials are missing or the recipient has no email,
 * it logs and returns false rather than throwing — notification delivery on
 * other channels must not fail because email is unconfigured.
 */
import { logger } from 'firebase-functions/v1';
import { SourceApp } from '@freedi/shared-types';
import { getEmailTransporter } from '../utils/emailTransporter';

/**
 * Per-app base URLs for absolute links in emails. Env-overridable so each
 * deployment can point at the right host; the defaults are the public domains.
 */
const APP_BASE_URLS: Record<SourceApp, string> = {
	[SourceApp.MAIN]: process.env.MAIN_APP_URL || 'https://freedi.tech',
	[SourceApp.CHAT]: process.env.CHAT_APP_URL || 'https://chat.freedi.tech',
	[SourceApp.SIGN]: process.env.SIGN_APP_URL || 'https://sign.freedi.tech',
	[SourceApp.MASS_CONSENSUS]: process.env.MC_APP_URL || 'https://mc.freedi.tech',
	[SourceApp.FLOW]: process.env.FLOW_APP_URL || 'https://flow.freedi.tech',
	[SourceApp.AGORA]: process.env.AGORA_APP_URL || 'https://agora.freedi.tech',
	[SourceApp.JOIN]: process.env.JOIN_APP_URL || 'https://join.wizcol.com',
};

/** Resolve a possibly-relative targetPath to an absolute URL for the given app. */
export function resolveAbsoluteUrl(sourceApp: SourceApp | undefined, targetPath: string): string {
	if (/^https?:\/\//i.test(targetPath)) return targetPath;
	const base = (sourceApp && APP_BASE_URLS[sourceApp]) || APP_BASE_URLS[SourceApp.MAIN];
	const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

	return `${base}${path}`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function buildHtml(params: {
	title: string;
	bodyText: string;
	url: string;
	buttonText: string;
	recipientName?: string;
}): string {
	const greeting = params.recipientName ? `Hello ${escapeHtml(params.recipientName)},` : 'Hello,';

	return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#f9f9f9;border-radius:8px;padding:25px;">
    <p>${greeting}</p>
    <p>${escapeHtml(params.bodyText)}</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${params.url}" style="background:rgb(132,187,247);color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">${escapeHtml(params.buttonText)}</a>
    </div>
    <p style="font-size:12px;color:#888;">You’re receiving this because you follow this discussion on Freedi. You can change your notification settings in the app.</p>
  </div>
</body></html>`;
}

export interface NotificationEmailInput {
	to: string;
	recipientName?: string;
	subject: string;
	bodyText: string;
	/** App-relative or absolute deep link. */
	targetPath: string;
	sourceApp?: SourceApp;
	buttonText?: string;
}

/** Send one notification email. Returns true on success, false if skipped/failed. */
export async function sendNotificationEmail(input: NotificationEmailInput): Promise<boolean> {
	if (!input.to) return false;

	const transporter = await getEmailTransporter();
	if (!transporter) return false; // credentials missing — already warned

	const url = resolveAbsoluteUrl(input.sourceApp, input.targetPath);
	const html = buildHtml({
		title: input.subject,
		bodyText: input.bodyText,
		url,
		buttonText: input.buttonText ?? 'Open discussion',
		recipientName: input.recipientName,
	});

	try {
		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to: input.to,
			subject: input.subject,
			html,
		});

		return true;
	} catch (error) {
		logger.error('Failed to send notification email', {
			to: input.to,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

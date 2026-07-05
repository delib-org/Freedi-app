import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '@/lib/utils/logger';

/**
 * Build a nodemailer transporter from `EMAIL_USER` / `EMAIL_PASSWORD` /
 * `EMAIL_SERVICE` env vars (same convention as the Freedi functions).
 *
 * Returns `null` (with a warn-level log) when credentials are missing so callers
 * can degrade gracefully — creating an invitation must still succeed even when
 * email is not configured. Set these vars in Vercel and `apps/sign/.env.local`.
 */
export function getEmailTransporter(): Transporter | null {
	const emailUser = process.env.EMAIL_USER;
	const emailPassword = process.env.EMAIL_PASSWORD;

	if (!emailUser || !emailPassword) {
		logger.warn('[email] Credentials not configured (EMAIL_USER / EMAIL_PASSWORD missing) — skipping send');

		return null;
	}

	try {
		return nodemailer.createTransport({
			service: process.env.EMAIL_SERVICE || 'gmail',
			auth: {
				user: emailUser,
				pass: emailPassword,
			},
		});
	} catch (error) {
		logger.error('[email] Failed to create transporter:', error);

		return null;
	}
}

/** The "From" address for outgoing Sign emails. */
export function getFromAddress(): string {
	const user = process.env.EMAIL_USER || 'noreply@wizcol.com';

	return `WizCol Sign <${user}>`;
}

import { logger } from 'firebase-functions/v1';
import * as nodemailer from 'nodemailer';

/**
 * Build a nodemailer transporter from `EMAIL_USER` / `EMAIL_PASSWORD` /
 * `EMAIL_SERVICE` env vars. Returns `null` (with a warn-level log) when
 * credentials are missing so callers can degrade gracefully — the calling
 * function should still complete its non-email work and surface the missing-
 * credentials state to operators rather than throwing.
 */
export async function getEmailTransporter(): Promise<nodemailer.Transporter | null> {
	try {
		const emailUser = process.env.EMAIL_USER;
		const emailPassword = process.env.EMAIL_PASSWORD;

		if (!emailUser || !emailPassword) {
			logger.warn('Email credentials not configured (EMAIL_USER / EMAIL_PASSWORD missing)');

			return null;
		}

		return nodemailer.createTransport({
			service: process.env.EMAIL_SERVICE || 'gmail',
			auth: {
				user: emailUser,
				pass: emailPassword,
			},
		});
	} catch (error) {
		logger.error('Error creating email transporter:', error);

		return null;
	}
}

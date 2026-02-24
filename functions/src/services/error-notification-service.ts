import * as nodemailer from 'nodemailer';
import { logger } from 'firebase-functions';

// Admin emails to notify on critical errors
const ADMIN_EMAILS = process.env.ADMIN_ERROR_EMAILS || 'tal.yaron@gmail.com';

// Throttle: Don't send more than 1 email per error type per hour
const errorThrottle: Map<string, number> = new Map();
const THROTTLE_DURATION_MS = 60 * 60 * 1000; // 1 hour

interface ErrorNotificationOptions {
	errorType: string;
	errorMessage: string;
	context?: Record<string, unknown>;
	severity?: 'warning' | 'error' | 'critical';
}

/**
 * Gets email transporter configuration
 * Uses process.env variables (EMAIL_USER, EMAIL_PASSWORD, EMAIL_SERVICE)
 */
async function getEmailTransporter(): Promise<nodemailer.Transporter | null> {
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

/**
 * Check if we should throttle this error notification
 */
function shouldThrottle(errorType: string): boolean {
	const lastSent = errorThrottle.get(errorType);
	if (!lastSent) return false;

	return Date.now() - lastSent < THROTTLE_DURATION_MS;
}

/**
 * Send error notification email to admins
 */
export async function sendErrorNotification(options: ErrorNotificationOptions): Promise<boolean> {
	const { errorType, errorMessage, context = {}, severity = 'error' } = options;

	// Check throttle
	if (shouldThrottle(errorType)) {
		logger.info(`Error notification throttled for: ${errorType}`);

		return false;
	}

	if (!ADMIN_EMAILS) {
		logger.warn('No admin emails configured for error notifications');

		return false;
	}

	try {
		const transporter = await getEmailTransporter();
		if (!transporter) {
			logger.warn('Email transporter not available for error notification');

			return false;
		}

		const emailUser = process.env.EMAIL_USER;

		const severityEmoji = severity === 'critical' ? '🚨' : severity === 'error' ? '❌' : '⚠️';
		const severityColor =
			severity === 'critical' ? '#dc3545' : severity === 'error' ? '#fd7e14' : '#ffc107';

		const contextHtml = Object.entries(context)
			.map(([key, value]) => `<li><strong>${key}:</strong> ${JSON.stringify(value)}</li>`)
			.join('');

		const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${severityColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${severityEmoji} ${severity.toUpperCase()}: ${errorType}</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2 style="color: #333;">Error Details</h2>
          <p style="background: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid ${severityColor};">
            ${errorMessage}
          </p>

          ${
						Object.keys(context).length > 0
							? `
            <h3 style="color: #333;">Context</h3>
            <ul style="background: #fff; padding: 15px 15px 15px 35px; border-radius: 5px;">
              ${contextHtml}
            </ul>
          `
							: ''
					}

          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            Time: ${new Date().toISOString()}<br>
            Environment: ${process.env.FUNCTIONS_EMULATOR ? 'Emulator' : 'Production'}
          </p>
        </div>
      </div>
    `;

		await transporter.sendMail({
			from: emailUser,
			to: ADMIN_EMAILS,
			subject: `${severityEmoji} [Freedi] ${severity.toUpperCase()}: ${errorType}`,
			html,
			text: `${severity.toUpperCase()}: ${errorType}\n\nError: ${errorMessage}\n\nContext: ${JSON.stringify(context, null, 2)}\n\nTime: ${new Date().toISOString()}`,
		});

		// Update throttle
		errorThrottle.set(errorType, Date.now());

		logger.info('Error notification sent', { errorType, severity });

		return true;
	} catch (error) {
		logger.error('Failed to send error notification', { error, errorType });

		return false;
	}
}

/**
 * Send AI-specific error notification
 */
export async function notifyAIError(
	errorMessage: string,
	context: {
		model?: string;
		prompt?: string;
		attempt?: number;
		userId?: string;
		functionName?: string;
	},
): Promise<boolean> {
	return sendErrorNotification({
		errorType: 'AI Model Error',
		errorMessage,
		context: {
			...context,
			prompt: context.prompt ? context.prompt.substring(0, 200) + '...' : undefined,
		},
		severity: 'error',
	});
}

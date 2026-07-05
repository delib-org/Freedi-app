import * as nodemailer from 'nodemailer';
import { logger } from 'firebase-functions';
import { db } from '../db';

// Admin emails to notify on critical errors
const ADMIN_EMAILS = process.env.ADMIN_ERROR_EMAILS || 'tal.yaron@gmail.com';

// Throttle: Don't send more than 1 email per error type per hour.
// Backed by Firestore (not an in-memory Map) so the limit holds ACROSS Cloud
// Function instances — an autoscaled burst of the same error under load used to
// send one email per instance per hour, flooding the admin inbox.
const THROTTLE_DURATION_MS = 60 * 60 * 1000; // 1 hour
const ADMIN_ERROR_THROTTLE_COLLECTION = 'adminErrorThrottle';

interface ErrorNotificationOptions {
	errorType: string;
	errorMessage: string;
	context?: Record<string, unknown>;
	severity?: 'warning' | 'error' | 'critical';
}

interface ThrottleReservation {
	/** Whether the caller may send now (false = throttled, stay silent). */
	send: boolean;
	/** How many same-type errors were suppressed since the last email went out. */
	suppressedSinceLast: number;
}

/** Firestore doc ids may not contain '/'. */
function throttleDocId(errorType: string): string {
	return errorType.replace(/\//g, '_') || 'unknown';
}

/**
 * Atomically decide whether an email for `errorType` may be sent, across all
 * instances. Reserves the hourly slot in a transaction so concurrent instances
 * can't each send. When throttled, bumps a `suppressedCount`; when a slot is
 * granted, returns how many were suppressed since the last send (for a digest
 * line) and resets the counter.
 */
export async function reserveErrorNotificationSlot(
	errorType: string,
	now: number = Date.now(),
): Promise<ThrottleReservation> {
	const ref = db.collection(ADMIN_ERROR_THROTTLE_COLLECTION).doc(throttleDocId(errorType));

	return db.runTransaction(async (transaction) => {
		const snapshot = await transaction.get(ref);
		const data = (snapshot.data() ?? {}) as { lastSentAt?: number; suppressedCount?: number };
		const lastSentAt = typeof data.lastSentAt === 'number' ? data.lastSentAt : 0;
		const suppressedCount = typeof data.suppressedCount === 'number' ? data.suppressedCount : 0;

		if (now - lastSentAt < THROTTLE_DURATION_MS) {
			transaction.set(
				ref,
				{ suppressedCount: suppressedCount + 1, lastSuppressedAt: now },
				{ merge: true },
			);

			return { send: false, suppressedSinceLast: suppressedCount + 1 };
		}

		transaction.set(ref, { lastSentAt: now, suppressedCount: 0 }, { merge: true });

		return { send: true, suppressedSinceLast: suppressedCount };
	});
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
 * Send error notification email to admins
 */
export async function sendErrorNotification(options: ErrorNotificationOptions): Promise<boolean> {
	const { errorType, errorMessage, context = {}, severity = 'error' } = options;

	if (!ADMIN_EMAILS) {
		logger.warn('No admin emails configured for error notifications');

		return false;
	}

	// Confirm we can actually send before reserving the throttle slot, so a
	// missing transporter doesn't consume the hour and silence real alerts.
	const transporter = await getEmailTransporter();
	if (!transporter) {
		logger.warn('Email transporter not available for error notification');

		return false;
	}

	// Cross-instance throttle: reserve the hourly slot in Firestore.
	let reservation: ThrottleReservation;
	try {
		reservation = await reserveErrorNotificationSlot(errorType);
	} catch (error) {
		// If the throttle store is unreachable, fail open on the SEND side would
		// risk a flood; instead stay silent and log — a dropped alert is safer than
		// an inbox flood, and the error is still in the function logs.
		logger.warn('Error-notification throttle check failed; suppressing email', {
			errorType,
			error,
		});

		return false;
	}

	if (!reservation.send) {
		logger.info(`Error notification throttled for: ${errorType}`, {
			suppressedSinceLast: reservation.suppressedSinceLast,
		});

		return false;
	}

	try {
		const emailUser = process.env.EMAIL_USER;

		const suppressedNote =
			reservation.suppressedSinceLast > 0
				? `${reservation.suppressedSinceLast} more "${errorType}" error(s) were suppressed since the last email (1/hour limit).`
				: '';

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

          ${
						suppressedNote
							? `<p style="background: #fff3cd; color: #664d03; padding: 10px 15px; border-radius: 5px; font-size: 13px;">${suppressedNote}</p>`
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
			text: `${severity.toUpperCase()}: ${errorType}\n\nError: ${errorMessage}\n\nContext: ${JSON.stringify(context, null, 2)}${suppressedNote ? `\n\n${suppressedNote}` : ''}\n\nTime: ${new Date().toISOString()}`,
		});

		logger.info('Error notification sent', {
			errorType,
			severity,
			suppressedSinceLast: reservation.suppressedSinceLast,
		});

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

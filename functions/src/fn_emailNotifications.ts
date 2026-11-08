import { db } from '.';
import { logger, Request, Response } from 'firebase-functions/v1';
import { Collections } from '@freedi/shared-types';
import {
	EmailSubscriber,
	SendEmailNotificationRequest,
	SendEmailNotificationResponse,
	AddEmailSubscriberRequest,
	AddEmailSubscriberResponse,
} from './types/email-types';
import { createMassConsensusNotificationEmail } from './email-templates';
import { getEmailTransporter } from './utils/emailTransporter';
import { logError } from './utils/errorHandling';
import { requireStatementAdmin } from './utils/httpAuth';
import { safeHttpUrl } from './utils/htmlEscape';
import {
	API_RATE_LIMITS_COLLECTION,
	passesHttpRateLimit,
	reserveWindowSlot,
} from './utils/rateLimit';
import { EMAIL_RECIPIENTS_GLOBAL_PER_DAY, RATE_BUDGETS } from './config/rateBudgets';

// Collection name for email subscribers
const EMAIL_SUBSCRIBERS_COLLECTION = 'emailSubscribers';
const MAX_EMAIL_LENGTH = 254;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
	if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH) return false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	return emailRegex.test(email);
}

/**
 * Count these addressees against the project's daily sending budget. Counted in
 * recipients, not sends, because one send can reach a whole subscriber list.
 */
async function reserveRecipients(res: Response, recipients: number, uid: string): Promise<boolean> {
	try {
		await reserveWindowSlot({
			collection: API_RATE_LIMITS_COLLECTION,
			docId: 'emailRecipients__global',
			limit: EMAIL_RECIPIENTS_GLOBAL_PER_DAY,
			windowMs: DAY_MS,
			label: 'email recipients global daily',
			now: Date.now(),
			cost: recipients,
			expires: true,
		});

		return true;
	} catch (error) {
		logError(error, {
			operation: 'emailNotifications.reserveRecipients',
			userId: uid,
			metadata: { recipients },
		});
		res
			.status(429)
			.json({ ok: false, message: 'Daily email limit reached', error: 'RATE_LIMITED' });

		return false;
	}
}

/**
 * Add an email subscriber for a statement
 * Called from mass-consensus app when user submits their email
 */
export const addEmailSubscriber = async (
	req: Request,
	res: Response,
	uid: string,
): Promise<void> => {
	try {
		const { email, statementId, source = 'mass-consensus' } = req.body as AddEmailSubscriberRequest;

		// Validate required fields
		if (!email || !statementId) {
			const response: AddEmailSubscriberResponse = {
				ok: false,
				message: 'Email and statementId are required',
				error: 'MISSING_FIELDS',
			};
			res.status(400).send(response);

			return;
		}

		// Validate email format
		if (!isValidEmail(email)) {
			const response: AddEmailSubscriberResponse = {
				ok: false,
				message: 'Invalid email format',
				error: 'INVALID_EMAIL',
			};
			res.status(400).send(response);

			return;
		}

		// Check if statement exists
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!statementDoc.exists) {
			const response: AddEmailSubscriberResponse = {
				ok: false,
				message: 'Statement not found',
				error: 'STATEMENT_NOT_FOUND',
			};
			res.status(404).send(response);

			return;
		}

		// Check if email is already subscribed for this statement
		const existingSubscriber = await db
			.collection(EMAIL_SUBSCRIBERS_COLLECTION)
			.where('email', '==', email.toLowerCase())
			.where('statementId', '==', statementId)
			.where('isActive', '==', true)
			.limit(1)
			.get();

		if (!existingSubscriber.empty) {
			const response: AddEmailSubscriberResponse = {
				ok: true,
				message: 'Email already subscribed',
				subscriberId: existingSubscriber.docs[0].id,
			};
			res.send(response);

			return;
		}

		// Create new subscriber
		const subscriberId = `${statementId}--${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}--${Date.now()}`;
		const subscriber: EmailSubscriber = {
			subscriberId,
			email: email.toLowerCase(),
			statementId,
			userId: uid,
			createdAt: Date.now(),
			isActive: true,
			source,
		};

		await db.collection(EMAIL_SUBSCRIBERS_COLLECTION).doc(subscriberId).set(subscriber);

		logger.info('Email subscriber added', {
			subscriberId,
			statementId,
			source,
		});

		const response: AddEmailSubscriberResponse = {
			ok: true,
			message: 'Successfully subscribed to email notifications',
			subscriberId,
		};
		res.send(response);
	} catch (error) {
		logError(error, { operation: 'emailNotifications.addEmailSubscriber', userId: uid });
		const response: AddEmailSubscriberResponse = {
			ok: false,
			message: 'Failed to add email subscriber',
			error: 'INTERNAL',
		};
		res.status(500).send(response);
	}
};

/**
 * Send email notification to all subscribers of a statement
 * Called by admin from main app's statement settings
 */
export const sendEmailToSubscribers = async (
	req: Request,
	res: Response,
	uid: string,
): Promise<void> => {
	try {
		const { statementId, subject, message, buttonText, buttonUrl } =
			req.body as SendEmailNotificationRequest;

		// Validate required fields
		if (
			!statementId ||
			typeof subject !== 'string' ||
			!subject ||
			typeof message !== 'string' ||
			!message
		) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Missing required fields: statementId, subject and message are required',
				error: 'MISSING_FIELDS',
			};
			res.status(400).send(response);

			return;
		}

		const safeButtonUrl = safeHttpUrl(buttonUrl);
		if (buttonUrl && !safeButtonUrl) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Button URL must be an http(s) address',
				error: 'INVALID_URL',
			};
			res.status(400).send(response);

			return;
		}

		// Stops fake admins: a body adminId used to be enough to pass this gate.
		const statement = await requireStatementAdmin(
			res,
			uid,
			statementId,
			'emailNotifications.sendEmailToSubscribers',
		);
		if (!statement) return;

		// Get all active email subscribers for this statement
		const subscribersSnapshot = await db
			.collection(EMAIL_SUBSCRIBERS_COLLECTION)
			.where('statementId', '==', statementId)
			.where('isActive', '==', true)
			.get();

		if (subscribersSnapshot.empty) {
			const response: SendEmailNotificationResponse = {
				ok: true,
				message: 'No email subscribers found for this statement',
				sentCount: 0,
				failedCount: 0,
			};
			res.send(response);

			return;
		}

		if (!(await passesHttpRateLimit(req, res, RATE_BUDGETS.sendEmailToSubscribers, uid))) return;
		if (!(await reserveRecipients(res, subscribersSnapshot.size, uid))) return;

		// Get email transporter
		const transporter = await getEmailTransporter();
		if (!transporter) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Email service not configured',
				error: 'EMAIL_NOT_CONFIGURED',
			};
			res.status(500).send(response);

			return;
		}

		const emailUser = process.env.EMAIL_USER;

		// Send emails to all subscribers
		let sentCount = 0;
		let failedCount = 0;

		const subscribers = subscribersSnapshot.docs.map((doc) => doc.data() as EmailSubscriber);

		for (const subscriber of subscribers) {
			try {
				const emailHtml = createMassConsensusNotificationEmail({
					statementId,
					statementTitle: statement.statement,
					message,
					buttonText,
					buttonUrl: safeButtonUrl,
				});

				await transporter.sendMail({
					from: emailUser,
					to: subscriber.email,
					subject: subject,
					html: emailHtml,
					text: `${message}\n\nView more at: ${safeButtonUrl || `https://freedi.tech/statement/${statementId}`}`,
				});

				sentCount++;
				logger.info('Email sent successfully', {
					subscriberId: subscriber.subscriberId,
					statementId,
				});
			} catch (emailError) {
				failedCount++;
				logger.error('Failed to send email to subscriber', {
					subscriberId: subscriber.subscriberId,
					email: subscriber.email,
					error: emailError instanceof Error ? emailError.message : 'Unknown error',
				});
			}
		}

		const response: SendEmailNotificationResponse = {
			ok: true,
			message: `Email notification sent to ${sentCount} subscribers`,
			sentCount,
			failedCount,
		};

		logger.info('Email notification batch completed', {
			statementId,
			sentCount,
			failedCount,
			adminId: uid,
		});

		res.send(response);
	} catch (error) {
		logError(error, { operation: 'emailNotifications.sendEmailToSubscribers', userId: uid });
		const response: SendEmailNotificationResponse = {
			ok: false,
			message: 'Failed to send email notifications',
			error: 'INTERNAL',
		};
		res.status(500).send(response);
	}
};

/**
 * Get subscriber count for a statement
 * Used by admin to see how many people will receive the notification
 */
export const getEmailSubscriberCount = async (
	req: Request,
	res: Response,
	uid: string,
): Promise<void> => {
	try {
		const { statementId } = req.query as { statementId: string };

		if (!statementId) {
			res.status(400).send({ ok: false, message: 'statementId is required', count: 0 });

			return;
		}

		const statement = await requireStatementAdmin(
			res,
			uid,
			statementId,
			'emailNotifications.getEmailSubscriberCount',
		);
		if (!statement) return;

		const subscribersSnapshot = await db
			.collection(EMAIL_SUBSCRIBERS_COLLECTION)
			.where('statementId', '==', statementId)
			.where('isActive', '==', true)
			.get();

		res.send({
			ok: true,
			count: subscribersSnapshot.size,
			statementId,
		});
	} catch (error) {
		logError(error, { operation: 'emailNotifications.getEmailSubscriberCount', userId: uid });
		res.status(500).send({ ok: false, message: 'Failed to get subscriber count', count: 0 });
	}
};

/**
 * Unsubscribe an email from notifications.
 *
 * Deliberately needs no sign-in: this is an opt-out, and it must not ask someone
 * for an account they do not have. No sent email carries a link to it yet, so
 * there is no signed token to verify; when a link is added it should carry an
 * HMAC of subscriberId and this body-based form should go.
 */
export const unsubscribeEmail = async (req: Request, res: Response): Promise<void> => {
	try {
		const { subscriberId, email, statementId } = req.body as {
			subscriberId?: string;
			email?: string;
			statementId?: string;
		};

		if (subscriberId) {
			// Unsubscribe by subscriber ID
			await db.collection(EMAIL_SUBSCRIBERS_COLLECTION).doc(subscriberId).update({
				isActive: false,
			});
		} else if (email && statementId) {
			// Unsubscribe by email and statement
			const subscribersSnapshot = await db
				.collection(EMAIL_SUBSCRIBERS_COLLECTION)
				.where('email', '==', email.toLowerCase())
				.where('statementId', '==', statementId)
				.get();

			const batch = db.batch();
			subscribersSnapshot.docs.forEach((doc) => {
				batch.update(doc.ref, { isActive: false });
			});
			await batch.commit();
		} else {
			res
				.status(400)
				.send({ ok: false, message: 'Either subscriberId or (email and statementId) is required' });

			return;
		}

		res.send({ ok: true, message: 'Successfully unsubscribed from email notifications' });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error unsubscribing email', { error: errorMessage });
		res.status(500).send({ ok: false, message: errorMessage });
	}
};

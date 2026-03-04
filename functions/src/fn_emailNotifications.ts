import { db } from '.';
import { logger, Request, Response } from 'firebase-functions/v1';
import { Collections, Statement } from '@freedi/shared-types';
import * as nodemailer from 'nodemailer';
import {
	EmailSubscriber,
	SendEmailNotificationRequest,
	SendEmailNotificationResponse,
	AddEmailSubscriberRequest,
	AddEmailSubscriberResponse,
} from './types/email-types';
import { createMassConsensusNotificationEmail } from './email-templates';

// Collection name for email subscribers
const EMAIL_SUBSCRIBERS_COLLECTION = 'emailSubscribers';

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	return emailRegex.test(email);
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
 * Add an email subscriber for a statement
 * Called from mass-consensus app when user submits their email
 */
export const addEmailSubscriber = async (req: Request, res: Response): Promise<void> => {
	try {
		const {
			email,
			statementId,
			userId,
			source = 'mass-consensus',
		} = req.body as AddEmailSubscriberRequest;

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
			userId: userId || undefined,
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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error adding email subscriber', { error: errorMessage });
		const response: AddEmailSubscriberResponse = {
			ok: false,
			message: 'Failed to add email subscriber',
			error: errorMessage,
		};
		res.status(500).send(response);
	}
};

/**
 * Send email notification to all subscribers of a statement
 * Called by admin from main app's statement settings
 */
export const sendEmailToSubscribers = async (req: Request, res: Response): Promise<void> => {
	try {
		const { statementId, subject, message, adminId, buttonText, buttonUrl } =
			req.body as SendEmailNotificationRequest;

		// Validate required fields
		if (!statementId || !subject || !message || !adminId) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Missing required fields: statementId, subject, message, and adminId are required',
				error: 'MISSING_FIELDS',
			};
			res.status(400).send(response);

			return;
		}

		// Verify admin has permission (check if user is admin of the statement)
		const subscriptionQuery = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.where('userId', '==', adminId)
			.limit(1)
			.get();

		if (subscriptionQuery.empty) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'User is not subscribed to this statement',
				error: 'NOT_AUTHORIZED',
			};
			res.status(403).send(response);

			return;
		}

		const userSubscription = subscriptionQuery.docs[0].data();
		if (userSubscription.role !== 'admin' && userSubscription.role !== 'creator') {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Only admins can send email notifications',
				error: 'NOT_AUTHORIZED',
			};
			res.status(403).send(response);

			return;
		}

		// Get statement details for the email
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!statementDoc.exists) {
			const response: SendEmailNotificationResponse = {
				ok: false,
				message: 'Statement not found',
				error: 'STATEMENT_NOT_FOUND',
			};
			res.status(404).send(response);

			return;
		}
		const statement = statementDoc.data() as Statement;

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
					buttonUrl,
				});

				await transporter.sendMail({
					from: emailUser,
					to: subscriber.email,
					subject: subject,
					html: emailHtml,
					text: `${message}\n\nView more at: ${buttonUrl || `https://freedi.tech/statement/${statementId}`}`,
				});

				sentCount++;
				logger.info('Email sent successfully', {
					subscriberId: subscriber.subscriberId,
					email: subscriber.email,
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
			adminId,
		});

		res.send(response);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error sending email notifications', { error: errorMessage });
		const response: SendEmailNotificationResponse = {
			ok: false,
			message: 'Failed to send email notifications',
			error: errorMessage,
		};
		res.status(500).send(response);
	}
};

/**
 * Get subscriber count for a statement
 * Used by admin to see how many people will receive the notification
 */
export const getEmailSubscriberCount = async (req: Request, res: Response): Promise<void> => {
	try {
		const { statementId } = req.query as { statementId: string };

		if (!statementId) {
			res.status(400).send({ ok: false, message: 'statementId is required', count: 0 });

			return;
		}

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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error getting email subscriber count', { error: errorMessage });
		res.status(500).send({ ok: false, message: errorMessage, count: 0 });
	}
};

/**
 * Unsubscribe an email from notifications
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

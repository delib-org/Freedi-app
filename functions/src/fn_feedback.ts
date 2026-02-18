import { db } from '.';
import { logger, Request, Response } from 'firebase-functions/v1';
import { Collections, Feedback, FeedbackSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import * as nodemailer from 'nodemailer';

export const addFeedback = async (req: Request, res: Response) => {
	try {
		// Parse and validate the feedback data
		const feedback = parse(FeedbackSchema, req.body);

		if (!feedback.feedbackId) {
			res.status(400).send({ error: 'Feedback ID is required', ok: false });

			return;
		}

		if (!feedback.statementId) {
			res.status(400).send({ error: 'Statement ID is required', ok: false });

			return;
		}

		if (!feedback.feedbackText || feedback.feedbackText.trim().length === 0) {
			res.status(400).send({ error: 'Feedback text is required', ok: false });

			return;
		}

		// Save feedback to Firestore
		await db.collection(Collections.feedback).doc(feedback.feedbackId).set(feedback);

		// Send email notification
		await sendFeedbackEmail(feedback);

		logger.info('Feedback saved successfully', {
			feedbackId: feedback.feedbackId,
			statementId: feedback.statementId,
		});

		res.send({ message: 'Feedback submitted successfully', ok: true });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error('Error adding feedback', { error: errorMessage });
		res.status(500).send({ error: errorMessage, ok: false });
	}
};

async function sendFeedbackEmail(feedback: Feedback): Promise<void> {
	try {
		// Check for email configuration
		// Support both Gmail (via app password) and custom SMTP
		const emailUser =
			process.env.EMAIL_USER ||
			(process.env.FUNCTIONS_EMULATOR
				? null
				: (await import('firebase-functions')).config().email?.user);

		const emailPassword =
			process.env.EMAIL_PASSWORD ||
			(process.env.FUNCTIONS_EMULATOR
				? null
				: (await import('firebase-functions')).config().email?.password);

		if (!emailUser || !emailPassword) {
			logger.warn('Email credentials not configured. Email notification skipped.');
			logger.info('To enable email notifications, set EMAIL_USER and EMAIL_PASSWORD');
			logger.info('Feedback details that would be emailed:', {
				statementTitle: feedback.statementTitle,
				feedbackText: feedback.feedbackText,
				userEmail: feedback.email,
				date: new Date(feedback.createdAt).toISOString(),
			});

			return;
		}

		// Create nodemailer transporter
		// Default to Gmail, but can be configured for other providers
		const transporter = nodemailer.createTransport({
			service: process.env.EMAIL_SERVICE || 'gmail',
			auth: {
				user: emailUser,
				pass: emailPassword,
			},
		});

		const emailData = {
			from: emailUser, // Sender will be the configured email account
			to: 'tal.yaron@gmail.com',
			subject: `New Feedback: ${feedback.statementTitle}`,
			html: `
				<!DOCTYPE html>
				<html>
				<head>
					<style>
						body {
							font-family: Arial, sans-serif;
							max-width: 600px;
							margin: 0 auto;
							padding: 20px;
						}
						.header {
							background-color: #f0f0f0;
							padding: 20px;
							border-radius: 8px;
							margin-bottom: 20px;
						}
						.content {
							background-color: #ffffff;
							padding: 20px;
							border: 1px solid #e0e0e0;
							border-radius: 8px;
						}
						.feedback-text {
							background-color: #f9f9f9;
							padding: 15px;
							border-left: 4px solid #4285f4;
							margin: 20px 0;
							font-style: italic;
						}
						.metadata {
							color: #666;
							font-size: 14px;
						}
					</style>
				</head>
				<body>
					<div class="header">
						<h2>🔔 New Feedback Received</h2>
					</div>
					<div class="content">
						<p><strong>Statement:</strong> ${feedback.statementTitle}</p>
						<p><strong>Statement ID:</strong> <code>${feedback.statementId}</code></p>
						<div class="metadata">
							<p><strong>User:</strong> ${feedback.creator.displayName} (${feedback.creator.uid})</p>
							${feedback.email ? `<p><strong>User Email:</strong> <a href="mailto:${feedback.email}">${feedback.email}</a></p>` : '<p><em>No email provided</em></p>'}
							<p><strong>Date:</strong> ${new Date(feedback.createdAt).toLocaleString('en-US', {
								dateStyle: 'full',
								timeStyle: 'short',
							})}</p>
						</div>
						<hr>
						<h3>Feedback Content:</h3>
						<div class="feedback-text">
							${feedback.feedbackText.replace(/\n/g, '<br>')}
						</div>
					</div>
				</body>
				</html>
			`,
			text: `
New Feedback Received

Statement: ${feedback.statementTitle}
Statement ID: ${feedback.statementId}
User: ${feedback.creator.displayName} (${feedback.creator.uid})
${feedback.email ? `User Email: ${feedback.email}` : 'No email provided'}
Date: ${new Date(feedback.createdAt).toLocaleString()}

Feedback:
${feedback.feedbackText}
			`,
		};

		// Send email using nodemailer
		const info = await transporter.sendMail(emailData);
		logger.info('Feedback email sent successfully', {
			to: 'tal.yaron@gmail.com',
			messageId: info.messageId,
		});
	} catch (error) {
		logger.error('Error sending feedback email:', error);
		// Don't throw - we still want to save the feedback even if email fails
	}
}

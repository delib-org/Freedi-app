/**
 * Email Subscriber - represents a user who subscribed for email notifications
 * in the mass-consensus app
 */
export interface EmailSubscriber {
	/** Unique subscriber ID (generated) */
	subscriberId: string;

	/** Email address of the subscriber */
	email: string;

	/** Statement ID this subscription is for */
	statementId: string;

	/** Optional user ID if authenticated */
	userId?: string;

	/** Timestamp when subscription was created (milliseconds) */
	createdAt: number;

	/** Whether the subscription is active */
	isActive: boolean;

	/** Optional: source of the subscription (e.g., 'mass-consensus', 'main-app') */
	source?: string;
}

/**
 * Request payload for sending email notifications to subscribers
 */
export interface SendEmailNotificationRequest {
	/** Statement ID to get subscribers for */
	statementId: string;

	/** Email subject */
	subject: string;

	/** Email message content (can include basic HTML) */
	message: string;

	/** Admin user ID (for authorization) */
	adminId: string;

	/** Optional: Custom button text */
	buttonText?: string;

	/** Optional: Custom button URL (defaults to statement URL) */
	buttonUrl?: string;
}

/**
 * Response for send email notification endpoint
 */
export interface SendEmailNotificationResponse {
	ok: boolean;
	message: string;
	sentCount?: number;
	failedCount?: number;
	error?: string;
}

/**
 * Request to add an email subscriber
 */
export interface AddEmailSubscriberRequest {
	email: string;
	statementId: string;
	userId?: string;
	source?: string;
}

/**
 * Response for adding an email subscriber
 */
export interface AddEmailSubscriberResponse {
	ok: boolean;
	message: string;
	subscriberId?: string;
	error?: string;
}

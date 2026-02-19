/**
 * Notification Analytics Service
 *
 * Tracks notification-related events for analytics:
 * - Permission requests and results
 * - Notification delivery and clicks
 * - Subscription changes
 * - Token lifecycle events
 */

import { analytics } from '@/controllers/db/config';
import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { logError } from '@/utils/errorHandling';

/**
 * Notification event types for analytics
 */
export enum NotificationEventType {
	// Permission events
	PERMISSION_REQUESTED = 'notification_permission_requested',
	PERMISSION_GRANTED = 'notification_permission_granted',
	PERMISSION_DENIED = 'notification_permission_denied',

	// Token events
	TOKEN_GENERATED = 'notification_token_generated',
	TOKEN_REFRESHED = 'notification_token_refreshed',
	TOKEN_DELETED = 'notification_token_deleted',
	TOKEN_INVALID = 'notification_token_invalid',

	// Subscription events
	SUBSCRIPTION_CREATED = 'notification_subscription_created',
	SUBSCRIPTION_REMOVED = 'notification_subscription_removed',
	SUBSCRIPTION_PUSH_ENABLED = 'notification_push_enabled',
	SUBSCRIPTION_PUSH_DISABLED = 'notification_push_disabled',

	// Notification events
	NOTIFICATION_RECEIVED = 'notification_received',
	NOTIFICATION_CLICKED = 'notification_clicked',
	NOTIFICATION_DISMISSED = 'notification_dismissed',

	// iOS-specific events
	IOS_PWA_INSTALL_PROMPT_SHOWN = 'ios_pwa_install_prompt_shown',
	IOS_UNSUPPORTED_PROMPT_SHOWN = 'ios_unsupported_prompt_shown',

	// Error events
	NOTIFICATION_ERROR = 'notification_error',
}

/**
 * Analytics event parameters
 */
interface NotificationAnalyticsParams {
	userId?: string;
	statementId?: string;
	platform?: string;
	errorCode?: string;
	errorMessage?: string;
	source?: string;
	tokenAge?: number;
	subscriptionCount?: number;
}

/**
 * Logs a notification-related analytics event.
 */
export function logNotificationEvent(
	eventType: NotificationEventType,
	params?: NotificationAnalyticsParams,
): void {
	try {
		if (!analytics) {
			// Analytics not initialized (likely development mode)
			console.info(`[NotificationAnalytics] ${eventType}`, params);

			return;
		}

		firebaseLogEvent(analytics, eventType, {
			...params,
			timestamp: Date.now(),
		});
	} catch (error) {
		// Silently fail - analytics should never break the app
		logError(error, { operation: 'services.notificationAnalytics.logNotificationEvent', metadata: { message: '[NotificationAnalytics] Failed to log event:' } });
	}
}

/**
 * Track permission request and result
 */
export function trackPermissionRequest(result: NotificationPermission | 'unsupported'): void {
	logNotificationEvent(NotificationEventType.PERMISSION_REQUESTED);

	if (result === 'granted') {
		logNotificationEvent(NotificationEventType.PERMISSION_GRANTED);
	} else if (result === 'denied') {
		logNotificationEvent(NotificationEventType.PERMISSION_DENIED);
	}
	// 'unsupported' and 'default' are not tracked as specific outcomes
}

/**
 * Track token generation
 */
export function trackTokenGenerated(userId: string, platform: string): void {
	logNotificationEvent(NotificationEventType.TOKEN_GENERATED, {
		userId,
		platform,
	});
}

/**
 * Track token refresh
 */
export function trackTokenRefreshed(userId: string, tokenAge: number): void {
	logNotificationEvent(NotificationEventType.TOKEN_REFRESHED, {
		userId,
		tokenAge,
	});
}

/**
 * Track token deletion
 */
export function trackTokenDeleted(userId: string): void {
	logNotificationEvent(NotificationEventType.TOKEN_DELETED, { userId });
}

/**
 * Track invalid token detection
 */
export function trackTokenInvalid(userId: string, errorCode?: string): void {
	logNotificationEvent(NotificationEventType.TOKEN_INVALID, {
		userId,
		errorCode,
	});
}

/**
 * Track subscription created
 */
export function trackSubscriptionCreated(userId: string, statementId: string): void {
	logNotificationEvent(NotificationEventType.SUBSCRIPTION_CREATED, {
		userId,
		statementId,
	});
}

/**
 * Track subscription removed
 */
export function trackSubscriptionRemoved(userId: string, statementId: string): void {
	logNotificationEvent(NotificationEventType.SUBSCRIPTION_REMOVED, {
		userId,
		statementId,
	});
}

/**
 * Track push notification enabled for subscription
 */
export function trackPushEnabled(userId: string, statementId: string): void {
	logNotificationEvent(NotificationEventType.SUBSCRIPTION_PUSH_ENABLED, {
		userId,
		statementId,
	});
}

/**
 * Track push notification disabled for subscription
 */
export function trackPushDisabled(userId: string, statementId: string): void {
	logNotificationEvent(NotificationEventType.SUBSCRIPTION_PUSH_DISABLED, {
		userId,
		statementId,
	});
}

/**
 * Track notification received
 */
export function trackNotificationReceived(
	userId: string,
	statementId?: string,
	source?: 'foreground' | 'background',
): void {
	logNotificationEvent(NotificationEventType.NOTIFICATION_RECEIVED, {
		userId,
		statementId,
		source,
	});
}

/**
 * Track notification clicked
 */
export function trackNotificationClicked(userId: string, statementId?: string): void {
	logNotificationEvent(NotificationEventType.NOTIFICATION_CLICKED, {
		userId,
		statementId,
	});
}

/**
 * Track notification dismissed
 */
export function trackNotificationDismissed(userId: string, statementId?: string): void {
	logNotificationEvent(NotificationEventType.NOTIFICATION_DISMISSED, {
		userId,
		statementId,
	});
}

/**
 * Track iOS-specific PWA install prompt shown
 */
export function trackIOSInstallPromptShown(): void {
	logNotificationEvent(NotificationEventType.IOS_PWA_INSTALL_PROMPT_SHOWN);
}

/**
 * Track iOS unsupported version prompt shown
 */
export function trackIOSUnsupportedPromptShown(): void {
	logNotificationEvent(NotificationEventType.IOS_UNSUPPORTED_PROMPT_SHOWN);
}

/**
 * Track notification error
 */
export function trackNotificationError(errorCode: string, errorMessage: string): void {
	logNotificationEvent(NotificationEventType.NOTIFICATION_ERROR, {
		errorCode,
		errorMessage,
	});
}

/**
 * NotificationAnalytics singleton for convenience
 */
export const NotificationAnalytics = {
	logEvent: logNotificationEvent,
	trackPermissionRequest,
	trackTokenGenerated,
	trackTokenRefreshed,
	trackTokenDeleted,
	trackTokenInvalid,
	trackSubscriptionCreated,
	trackSubscriptionRemoved,
	trackPushEnabled,
	trackPushDisabled,
	trackNotificationReceived,
	trackNotificationClicked,
	trackNotificationDismissed,
	trackIOSInstallPromptShown,
	trackIOSUnsupportedPromptShown,
	trackNotificationError,
} as const;

export default NotificationAnalytics;

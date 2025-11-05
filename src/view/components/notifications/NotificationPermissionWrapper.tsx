import React, { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import NotificationPermissionPrompt from './NotificationPermissionPrompt';
import { notificationService } from '@/services/notificationService';
import { notificationPermissionManager } from '@/services/notificationPermissionManager';
import { analyticsService, AnalyticsEvents } from '@/services/analytics';

/**
 * Global wrapper that listens for permission prompt events
 * and shows the NotificationPermissionPrompt component
 */
const NotificationPermissionWrapper: React.FC = () => {
	const [showPrompt, setShowPrompt] = useState(false);
	const [trigger, setTrigger] = useState<string>('');

	useEffect(() => {
		// Listen for show prompt event
		const handleShowPrompt = (event: Event) => {
			const customEvent = event as CustomEvent;
			console.info('[NotificationWrapper] Received show prompt event:', customEvent.detail);

			setTrigger(customEvent.detail.trigger || 'unknown');
			setShowPrompt(true);

			// Track that prompt was shown
			analyticsService.logEvent(AnalyticsEvents.NOTIFICATION_PROMPT_SHOWN, {
				trigger: customEvent.detail.trigger,
			});
		};

		window.addEventListener('show-notification-permission-prompt', handleShowPrompt);

		return () => {
			window.removeEventListener('show-notification-permission-prompt', handleShowPrompt);
		};
	}, []);

	const handleAccept = async () => {
		console.info('[NotificationWrapper] User accepted');

		try {
			// Request browser permission
			const permission = await Notification.requestPermission();

			if (permission === 'granted') {
				console.info('[NotificationWrapper] Permission granted!');

				// Initialize notification service
				const auth = getAuth();
				const currentUser = auth.currentUser;

				if (currentUser) {
					await notificationService.initialize(currentUser.uid);
					console.info('[NotificationWrapper] Notification service initialized');
				}

				// Track success
				analyticsService.logEvent(AnalyticsEvents.NOTIFICATION_ENABLED, {
					trigger,
				});
			} else {
				console.info('[NotificationWrapper] Permission denied');
			}
		} catch (error) {
			console.error('[NotificationWrapper] Error requesting permission:', error);
		}

		setShowPrompt(false);
	};

	const handleDismiss = () => {
		console.info('[NotificationWrapper] User dismissed');

		// Record dismissal
		notificationPermissionManager.recordDismissed();

		// Track dismissal
		analyticsService.logEvent(AnalyticsEvents.NOTIFICATION_PROMPT_DISMISSED, {
			trigger,
		});

		setShowPrompt(false);
	};

	return (
		<NotificationPermissionPrompt
			variant="minimal"
			isVisible={showPrompt}
			onAccept={handleAccept}
			onDismiss={handleDismiss}
		/>
	);
};

export default NotificationPermissionWrapper;

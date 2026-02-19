import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useAppSelector } from './reduxHooks';
import { hasTokenSelector } from '@/redux/statements/statementsSlice';
import { notificationService } from '@/services/notificationService';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { analyticsService, AnalyticsEvents } from '@/services/analytics';
import { logger } from '@/services/logger';
import { logError } from '@/utils/errorHandling';

// Helper to check if service workers are supported
const isServiceWorkerSupported = () => 'serviceWorker' in navigator;
// Helper to check if notifications are supported
const isNotificationSupported = () => 'Notification' in window;

/**
 * Hook to handle notifications for the application
 * @param statementId - The ID of the statement to handle notifications for (optional)
 * @returns An object with notification permission state and methods to interact with notifications
 */
export const useNotifications = (statementId?: string) => {
	const [permissionState, setPermissionState] = useState<{
		permission: NotificationPermission | 'unsupported';
		loading: boolean;
		token: string | null;
		serviceWorkerSupported: boolean;
	}>({
		permission:
			isNotificationSupported() && isServiceWorkerSupported()
				? notificationService.safeGetPermission()
				: 'unsupported',
		loading: false,
		token: null,
		serviceWorkerSupported: isServiceWorkerSupported(),
	});

	const params = useParams();
	const currentStatementId = statementId || params.statementId;
	const hasToken = currentStatementId
		? useAppSelector(hasTokenSelector('', currentStatementId))
		: false;

	// Initialize notifications based on authentication state
	useEffect(() => {
		// Early return if service workers or notifications aren't supported
		if (!notificationService.isSupported()) {
			console.info('Service Workers or Notifications not supported in this browser mode');

			return () => {}; // Empty cleanup function
		}

		const auth = getAuth();

		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (user) {
				// User is signed in, initialize notification service
				setPermissionState((prev) => ({ ...prev, loading: true }));
				try {
					await notificationService.initialize(user.uid);
					const token = notificationService.getToken();

					setPermissionState({
						permission: notificationService.safeGetPermission(),
						loading: false,
						token,
						serviceWorkerSupported: true,
					});
				} catch (error) {
					logError(error, { operation: 'hooks.useNotifications.unsubscribe', metadata: { message: 'Error initializing notifications:' } });
					setPermissionState((prev) => ({ ...prev, loading: false }));
				}
			} else {
				// User is signed out
				setPermissionState({
					permission: notificationService.safeGetPermission(),
					loading: false,
					token: null,
					serviceWorkerSupported: true,
				});
			}
		});

		// Set up listener for service worker messages
		const handleServiceWorkerMessage = (event: MessageEvent) => {
			if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
				console.info('Notification clicked:', event.data.payload);
				// Handle notification click - could update UI, navigate to relevant page, etc.
			} else if (event.data && event.data.type === 'PLAY_NOTIFICATION_SOUND') {
				// Play notification sound when requested by service worker
				playNotificationSound();
			}
		};

		// Only add event listener if service worker is available
		if (navigator.serviceWorker) {
			navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
		}

		// Clean up listeners on unmount
		return () => {
			unsubscribe();
			if (navigator.serviceWorker) {
				navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
			}
		};
	}, []);

	// Request notification permission
	const requestPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
		// Check if notifications are supported
		if (!notificationService.isSupported()) {
			return 'unsupported';
		}

		setPermissionState((prev) => ({ ...prev, loading: true }));

		try {
			const result = await Notification.requestPermission();

			// If permission was granted, initialize notifications
			if (result === 'granted') {
				const auth = getAuth();
				if (auth.currentUser) {
					await notificationService.initialize(auth.currentUser.uid);
					const token = notificationService.getToken();
					setPermissionState({
						permission: result,
						loading: false,
						token,
						serviceWorkerSupported: true,
					});

					// Track notification enabled
					logger.info('Notifications enabled', { userId: auth.currentUser.uid });
					analyticsService.logEvent(AnalyticsEvents.NOTIFICATION_ENABLED, {
						notificationType: 'all',
					});
				}
			} else {
				setPermissionState({
					permission: result,
					loading: false,
					token: null,
					serviceWorkerSupported: true,
				});

				logger.info('Notification permission denied', { result });
			}

			return result;
		} catch (error) {
			logger.error('Error requesting notification permission', error);
			setPermissionState((prev) => ({ ...prev, loading: false }));

			return 'denied';
		}
	};

	// Play notification sound
	const playNotificationSound = () => {
		try {
			const audio = new Audio('/assets/sounds/bell.mp3');
			audio.volume = 0.5; // 50% volume
			audio.play().catch((error: unknown) => logError(error, { operation: 'hooks.useNotifications.playNotificationSound' }));
		} catch (error) {
			logError(error, { operation: 'hooks.useNotifications.playNotificationSound', metadata: { message: 'Error playing notification sound:' } });
		}
	};

	// Send a test notification
	const sendTestNotification = () => {
		if (!notificationService.isSupported()) {
			console.info('Notifications not supported in this browser mode');

			return;
		}

		if (notificationService.safeGetPermission() !== 'granted') {
			logError(new Error('Notification permission not granted'), { operation: 'hooks.useNotifications.sendTestNotification' });

			return;
		}

		navigator.serviceWorker.ready.then((registration) => {
			registration.showNotification('FreeDi App', {
				body: 'This is a test notification',
				icon: '/icons/logo-192px.png',
				badge: '/icons/logo-48px.png',
				//@ts-ignore
				vibrate: [100, 50, 100],
				actions: [
					{
						action: 'open',
						title: 'Open',
					},
				],
				requireInteraction: true,
			});

			playNotificationSound();
		});
	};

	// Clear all notifications
	const clearNotifications = () => {
		if (!notificationService.isSupported()) {
			console.info('Notifications not supported in this browser mode');

			return;
		}

		navigator.serviceWorker.ready.then((registration) => {
			registration.getNotifications().then((notifications) => {
				notifications.forEach((notification) => notification.close());
			});

			// Send message to service worker to clear any background notifications
			if (navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage({
					type: 'CLEAR_NOTIFICATIONS',
				});
			}
		});
	};

	return {
		permissionState,
		requestPermission,
		sendTestNotification,
		clearNotifications,
		hasToken,
	};
};

export default useNotifications;

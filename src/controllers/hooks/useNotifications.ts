import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useAppSelector } from './reduxHooks';
import { hasTokenSelector } from '@/redux/statements/statementsSlice';
import { notificationService } from '@/services/notificationService';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

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
		permission: isNotificationSupported() ? Notification.permission : 'unsupported',
		loading: false,
		token: null,
		serviceWorkerSupported: isServiceWorkerSupported()
	});

	const params = useParams();
	const currentStatementId = statementId || params.statementId;
	const hasToken = currentStatementId
		? useAppSelector(hasTokenSelector('', currentStatementId))
		: false;

	// Initialize notifications based on authentication state
	useEffect(() => {
		// Early return if service workers or notifications aren't supported
		if (!isServiceWorkerSupported() || !isNotificationSupported()) {
			console.log('Service Workers or Notifications not supported in this browser mode');

			return () => { }; // Empty cleanup function
		}

		const auth = getAuth();

		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (user) {
				// User is signed in, initialize notification service
				setPermissionState(prev => ({ ...prev, loading: true }));
				try {
					await notificationService.initialize(user.uid);
					const token = notificationService.getToken();

					setPermissionState({
						permission: Notification.permission,
						loading: false,
						token,
						serviceWorkerSupported: true
					});
				} catch (error) {
					console.error('Error initializing notifications:', error);
					setPermissionState(prev => ({ ...prev, loading: false }));
				}
			} else {
				// User is signed out
				setPermissionState({
					permission: Notification.permission,
					loading: false,
					token: null,
					serviceWorkerSupported: true
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
		if (!isNotificationSupported() || !isServiceWorkerSupported()) {
			return 'unsupported';
		}

		setPermissionState(prev => ({ ...prev, loading: true }));

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
						serviceWorkerSupported: true
					});
				}
			} else {
				setPermissionState({
					permission: result,
					loading: false,
					token: null,
					serviceWorkerSupported: true
				});
			}

			return result;
		} catch (error) {
			console.error('Error requesting notification permission:', error);
			setPermissionState(prev => ({ ...prev, loading: false }));

			return 'denied';
		}
	};

	// Play notification sound
	const playNotificationSound = () => {
		try {
			const audio = new Audio('/assets/sounds/bell.mp3');
			audio.volume = 0.5; // 50% volume
			audio.play().catch(console.error);
		} catch (error) {
			console.error('Error playing notification sound:', error);
		}
	};

	// Send a test notification
	const sendTestNotification = () => {
		if (!isNotificationSupported() || !isServiceWorkerSupported()) {
			console.log('Notifications not supported in this browser mode');

			return;
		}

		if (Notification.permission !== 'granted') {
			console.error('Notification permission not granted');

			return;
		}

		navigator.serviceWorker.ready.then(registration => {
			registration.showNotification('FreeDi App', {
				body: 'This is a test notification',
				icon: '/icons/logo-192px.png',
				badge: '/icons/logo-48px.png',
				//@ts-ignore
				vibrate: [100, 50, 100],
				actions: [
					{
						action: 'open',
						title: 'Open'
					}
				],
				requireInteraction: true
			});

			playNotificationSound();
		});
	};

	// Clear all notifications
	const clearNotifications = () => {
		if (!isNotificationSupported() || !isServiceWorkerSupported()) {
			console.log('Notifications not supported in this browser mode');

			return;
		}

		navigator.serviceWorker.ready.then(registration => {
			registration.getNotifications().then(notifications => {
				notifications.forEach(notification => notification.close());
			});

			// Send message to service worker to clear any background notifications
			if (navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage({
					type: 'CLEAR_NOTIFICATIONS'
				});
			}
		});
	};

	return {
		permissionState,
		requestPermission,
		sendTestNotification,
		clearNotifications,
		hasToken
	};
};

export default useNotifications;
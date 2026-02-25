import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useBadgeSync } from '@/controllers/hooks/useBadgeSync';
import { isIOS, isIOSWebPushSupported, isInstalledPWA } from '@/services/platformService';
import { logError } from '@/utils/errorHandling';
// import InstallPWA from './InstallPWA';

interface PWAWrapperProps {
	children: React.ReactNode;
}

const PWAWrapper: React.FC<PWAWrapperProps> = ({ children }) => {
	const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

	// Sync Redux unread notification count with app badge
	useBadgeSync();

	// Check if we're in the MassConsensus route using window.location
	const checkIfInMassConsensus = () => {
		return window.location.pathname.includes('/mass-consensus');
	};

	// Hide notification prompt if we navigate to MassConsensus
	useEffect(() => {
		const handleLocationChange = () => {
			if (checkIfInMassConsensus() && showNotificationPrompt) {
				setShowNotificationPrompt(false);
			}
		};

		// Listen for URL changes
		window.addEventListener('popstate', handleLocationChange);

		// Also check on initial render and when showNotificationPrompt changes
		if (checkIfInMassConsensus() && showNotificationPrompt) {
			setShowNotificationPrompt(false);
		}

		return () => {
			window.removeEventListener('popstate', handleLocationChange);
		};
	}, [showNotificationPrompt]);

	useEffect(() => {
		// Initialize PWA wrapper

		// Set up the service worker in both production and development
		// Note: In development, service workers might behave differently
		// Always register service worker for notification support

		// Note: Badge count is managed by useBadgeSync hook which syncs with Redux state.
		// We don't manually clear badge here to avoid race conditions.
		// The badge will reflect the actual unread count from Redux.

		// Set up visibility change listener to sync badge and clear displayed notifications
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				// Tell the service worker to clear displayed notifications (not the badge)
				if (navigator.serviceWorker.controller) {
					navigator.serviceWorker.controller.postMessage({
						type: 'CLEAR_NOTIFICATIONS',
					});
				}
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Listen for service worker messages (e.g., module fetch failures after deployment)
		const handleServiceWorkerMessage = (event: MessageEvent) => {
			if (event.data && event.data.type === 'MODULE_FETCH_FAILED') {
				console.info('[PWAWrapper] Module fetch failed, reloading to get updated version...');
				// Clear caches and reload to get the new version
				const reloadPage = () => location.reload();

				if (typeof caches !== 'undefined') {
					caches
						.keys()
						.then((names) => {
							names.forEach((name) => {
								if (name === 'static-resources') {
									caches.delete(name);
								}
							});
						})
						.finally(reloadPage);
				} else {
					reloadPage();
				}
			}
		};

		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
		}

		// Explicitly register the Firebase Messaging Service Worker
		// Register on iOS only if it's an installed PWA with Web Push support (iOS 16.4+)
		const shouldRegisterFirebaseSW =
			'serviceWorker' in navigator && (!isIOS() || isIOSWebPushSupported());

		if (shouldRegisterFirebaseSW) {
			// First check if it's already registered
			navigator.serviceWorker.getRegistrations().then((registrations) => {
				const firebaseSW = registrations.find(
					(r) =>
						r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
						r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
						r.waiting?.scriptURL.includes('firebase-messaging-sw.js'),
				);

				if (!firebaseSW) {
					// Register Firebase Messaging SW with Firebase's default scope
					// This allows it to coexist with the PWA's main sw.js at root scope
					navigator.serviceWorker
						.register('/firebase-messaging-sw.js', {
							scope: '/firebase-cloud-messaging-push-scope',
						})
						.then((registration) => {
							console.info(
								'[PWAWrapper] Firebase Messaging SW registered with firebase-cloud-messaging-push-scope',
							);

							// Wait for activation
							if (registration.installing) {
								registration.installing.addEventListener('statechange', function () {
									if (this.state === 'activated') {
										console.info('[PWAWrapper] Firebase Messaging SW activated');
									}
								});
							}
						})
						.catch((error) => {
							logError(error, {
								operation: 'pwa.PWAWrapper.firebaseSW',
								metadata: { message: '[PWAWrapper] Firebase Messaging SW registration failed:' },
							});
						});
				} else {
					console.info('[PWAWrapper] Firebase Messaging SW already registered');
				}
			});
		} else if (isIOS() && !isInstalledPWA()) {
			console.info(
				'[PWAWrapper] iOS detected but not installed as PWA - push notifications require installing the app to home screen',
			);
		}

		registerSW({
			immediate: true, // Register immediately
			onNeedRefresh() {
				// Prompt mode: let user decide when to update
				console.info('New app version available. Refresh to update.');
			},
			onOfflineReady() {
				console.info('App ready to work offline');
			},
			onRegistered() {
				// Listen for controller changes (new SW taking control)
				if (navigator.serviceWorker) {
					navigator.serviceWorker.addEventListener('controllerchange', () => {
						// New service worker has taken control
						// Instead of reloading immediately, just log it
						// The autoUpdate mode will handle updates smoothly
						console.info('New service worker has taken control');
					});
				}
			},
			onRegisteredSW(_swUrl, registration) {
				// Service Worker registered

				// Check for updates periodically
				// Using a reasonable interval to avoid excessive update prompts
				const updateInterval = setInterval(
					() => {
						// Check for Service Worker updates
						registration?.update().catch((err) => {
							logError(err, {
								operation: 'pwa.PWAWrapper.updateInterval',
								metadata: { message: 'Error updating service worker:' },
							});
						});
					},
					4 * 60 * 60 * 1000,
				); // Check every 4 hours to reduce update frequency

				// Check if we should show notification prompt (but not in MassConsensus)
				if (
					'Notification' in window &&
					Notification.permission === 'default' &&
					!checkIfInMassConsensus()
				) {
					// Wait a bit before showing the notification prompt
					setTimeout(() => {
						// Double-check we're not in MassConsensus when the timer fires
						if (!checkIfInMassConsensus()) {
							setShowNotificationPrompt(true);
						}
					}, 5000);
				}

				// Clean up interval and event listener when component unmounts
				return () => {
					clearInterval(updateInterval);
					document.removeEventListener('visibilitychange', handleVisibilityChange);
					if ('serviceWorker' in navigator) {
						navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
					}
				};
			},
			onRegisterError(error) {
				logError(error, {
					operation: 'pwa.PWAWrapper.unknown',
					metadata: { message: 'Service worker registration error:' },
				});
			},
		});

		// Store update function for manual updates if needed

		// Note: Removed automatic update on online event to prevent refresh loops

		// Listen for notification permission changes
		const handlePermissionChange = () => {
			if (Notification.permission !== 'default') {
				setShowNotificationPrompt(false);
			}
		};

		// Try to listen for permission changes (not supported in all browsers)
		if ('permissions' in navigator) {
			navigator.permissions
				.query({ name: 'notifications' as PermissionName })
				.then((permissionStatus) => {
					permissionStatus.onchange = handlePermissionChange;
				})
				.catch((error: unknown) => logError(error, { operation: 'PWAWrapper.permissionQuery' }));
		}
	}, []);

	return (
		<>
			{children}

			{/* Auto-update mode: no toast needed */}
			{/* Hide notification prompt in MassConsensus routes */}
			{/* Temporarily disabled notification prompt */}
			{/* {showNotificationPrompt && !checkIfInMassConsensus() && (
				<NotificationPrompt onClose={() => setShowNotificationPrompt(false)} />
			)} */}
		</>
	);
};

export default PWAWrapper;

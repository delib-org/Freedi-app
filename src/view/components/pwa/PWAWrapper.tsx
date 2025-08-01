import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
// import InstallPWA from './InstallPWA';
import NotificationPrompt from '../notifications/NotificationPrompt';

// Function to clear badge count
const clearBadgeCount = async () => {
	try {
		// Clear badge using standard or experimental APIs based on browser support
		if ('clearAppBadge' in navigator) {
			await navigator.clearAppBadge();
		} else if ('clearExperimentalAppBadge' in navigator) {
			// @ts-ignore - Experimental API
			await navigator.clearExperimentalAppBadge();
		} else if ('ExperimentalBadge' in window) {
			// @ts-ignore - Experimental API
			await window.ExperimentalBadge.clear();
		}

		// Try to reset badge count in IndexedDB (safely)
		try {
			const openRequest = indexedDB.open('FreeDiNotifications', 1);

			// Handle database upgrade - this runs when the database is created or version is changed
			openRequest.onupgradeneeded = (event) => {
				// @ts-ignore - Type issues with event.target
				const db = event.target.result;
				// Create the object store if it doesn't exist
				if (!db.objectStoreNames.contains('badgeCounter')) {
					db.createObjectStore('badgeCounter', { keyPath: 'id' });
				}
			};

			openRequest.onsuccess = (event) => {
				try {
					// @ts-ignore - Type issues with event.target
					const db = event.target.result;

					// Check if the badgeCounter store exists
					if (!db.objectStoreNames.contains('badgeCounter')) {
						console.info('badgeCounter object store does not exist');

						return;
					}

					const transaction = db.transaction('badgeCounter', 'readwrite');
					const store = transaction.objectStore('badgeCounter');
					store.put({ id: 'badge', count: 0 });
				} catch (innerError) {
					console.info('Error accessing badgeCounter store:', innerError);
				}
			};

			openRequest.onerror = (event) => {
				console.info('IndexedDB open error:', event);
			};
		} catch (dbError) {
			console.info('IndexedDB operation failed:', dbError);
			// Not a critical error, just log and continue
		}
	} catch (error) {
		console.error('Error clearing badge count:', error);
	}
};

interface PWAWrapperProps {
	children: React.ReactNode;
}

const PWAWrapper: React.FC<PWAWrapperProps> = ({ children }) => {
	const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

	useEffect(() => {
		// Initialize PWA wrapper
		
		// Set up the service worker in both production and development
		// Note: In development, service workers might behave differently
		// Always register service worker for notification support
		
		// Clear badge when app is opened or focused
		clearBadgeCount();

		// Set up visibility change listener to clear badge when app comes into focus
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				clearBadgeCount();

				// Also tell the service worker to clear notifications
				if (navigator.serviceWorker.controller) {
					navigator.serviceWorker.controller.postMessage({
						type: 'CLEAR_NOTIFICATIONS'
					});
				}
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Explicitly register the Firebase Messaging Service Worker
		if ('serviceWorker' in navigator) {
			// First check if it's already registered
			navigator.serviceWorker.getRegistrations().then(registrations => {
				const firebaseSW = registrations.find(r => 
					r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
					r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
					r.waiting?.scriptURL.includes('firebase-messaging-sw.js')
				);
				
				if (!firebaseSW) {
					// Register Firebase Messaging SW
					navigator.serviceWorker.register('/firebase-messaging-sw.js', {
						scope: '/'
					})
					.then(registration => {
						// Firebase Messaging SW registered successfully
						
						// Wait for activation
						if (registration.installing) {
							registration.installing.addEventListener('statechange', function() {
								if (this.state === 'activated') {
									// Firebase Messaging SW activated
								}
							});
						}
					})
					.catch(error => {
						console.error('[PWAWrapper] Firebase Messaging SW registration failed:', error);
					});
				} else {
					// Firebase Messaging SW already registered
				}
			});
		}

		const updateFunc = registerSW({
				immediate: true, // Register immediately
				onNeedRefresh() {
					// For autoUpdate mode, this won't be called
					// Updates happen automatically
				},
				onOfflineReady() {
					console.info('App ready to work offline');
				},
				onRegistered() {
					// Listen for controller changes (new SW taking control)
					if (navigator.serviceWorker) {
						navigator.serviceWorker.addEventListener('controllerchange', () => {
							// New service worker has taken control
							// Reload the page to ensure users get the latest version
							window.location.reload();
						});
					}
				},
				onRegisteredSW(swUrl, registration) {
					// Service Worker registered

					// Check for updates periodically
					// Using a reasonable interval to avoid excessive update prompts
					const updateInterval = setInterval(() => {
						// Check for Service Worker updates
						registration?.update().catch(err => {
							console.error('Error updating service worker:', err);
						});
					}, 60 * 60 * 1000); // Check every hour instead of every minute

					// Check if we should show notification prompt
					if ('Notification' in window && Notification.permission === 'default') {
						// Wait a bit before showing the notification prompt
						setTimeout(() => {
							setShowNotificationPrompt(true);
						}, 5000);
					}

					// Clean up interval and event listener when component unmounts
					return () => {
						clearInterval(updateInterval);
						document.removeEventListener('visibilitychange', handleVisibilityChange);
					};
				},
				onRegisterError(error) {
					console.error('Service worker registration error:', error);
				}
			});

			// Auto-update mode: no need to store update function

			// Add event listeners for online/offline status
			window.addEventListener('online', () => {
				// App is online, check for updates
				updateFunc(false).catch(console.error);
			});

			// Listen for notification permission changes
			const handlePermissionChange = () => {
				if (Notification.permission !== 'default') {
					setShowNotificationPrompt(false);
				}
			};

			// Try to listen for permission changes (not supported in all browsers)
			if ('permissions' in navigator) {
				navigator.permissions.query({ name: 'notifications' as PermissionName })
					.then(permissionStatus => {
						permissionStatus.onchange = handlePermissionChange;
					})
					.catch(console.error);
		}
	}, []);

	return (
		<>
			{children}

			{/* Auto-update mode: no toast needed */}
			{showNotificationPrompt && (
				<NotificationPrompt onClose={() => setShowNotificationPrompt(false)} />
			)}
		</>
	);
};

export default PWAWrapper;
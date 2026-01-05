import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
// import InstallPWA from './InstallPWA';

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

		// Removed legacy firebase-messaging-sw.js registration block.
		// The main sw.js (registered by registerSW below) now handles all Firebase Messaging.

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
					const updateInterval = setInterval(() => {
						// Check for Service Worker updates
						registration?.update().catch(err => {
							console.error('Error updating service worker:', err);
						});
					}, 4 * 60 * 60 * 1000); // Check every 4 hours to reduce update frequency

					// Check if we should show notification prompt (but not in MassConsensus)
					if ('Notification' in window && Notification.permission === 'default' && !checkIfInMassConsensus()) {
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
					};
				},
				onRegisterError(error) {
					console.error('Service worker registration error:', error);
				}
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
			{/* Hide notification prompt in MassConsensus routes */}
			{/* Temporarily disabled notification prompt */}
			{/* {showNotificationPrompt && !checkIfInMassConsensus() && (
				<NotificationPrompt onClose={() => setShowNotificationPrompt(false)} />
			)} */}
		</>
	);
};

export default PWAWrapper;
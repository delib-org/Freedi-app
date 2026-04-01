import React, { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useSelector } from 'react-redux';
import { useBadgeSync } from '@/controllers/hooks/useBadgeSync';
import { PWA, STORAGE_KEYS, TIME } from '@/constants/common';
import {
	selectHasCreatedGroup,
	selectOptionsCreated,
	selectNotificationPromptDiscussionId,
	clearNotificationPromptTrigger,
} from '@/redux/pwa/pwaSlice';
import { useDispatch } from 'react-redux';
import { isIOS, isIOSWebPushSupported, isInstalledPWA } from '@/services/platformService';
import { logError } from '@/utils/errorHandling';
import { isBot } from '@/utils/botDetection';
import InstallPWA from './InstallPWA';
import NotificationPrompt from '../notifications/NotificationPrompt';

interface PWAWrapperProps {
	children: React.ReactNode;
}

const PWAWrapper: React.FC<PWAWrapperProps> = ({ children }) => {
	const [showInstallPrompt, setShowInstallPrompt] = useState(false);
	const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
	const dispatch = useDispatch();
	const hasCreatedGroup = useSelector(selectHasCreatedGroup);
	const optionsCreated = useSelector(selectOptionsCreated);
	const notificationPromptDiscussionId = useSelector(selectNotificationPromptDiscussionId);
	const previousIntentRef = useRef({ hasCreatedGroup, optionsCreated });

	const getStoredTimestamp = (key: string): number => {
		const value = localStorage.getItem(key);
		const parsed = Number(value);

		return Number.isFinite(parsed) ? parsed : 0;
	};

	const canShowByCooldown = (key: string, cooldownMs: number): boolean => {
		const lastDismissedAt = getStoredTimestamp(key);

		return Date.now() - lastDismissedAt >= cooldownMs;
	};

	// Sync Redux unread notification count with app badge
	useBadgeSync();

	// Check if we're in the MassConsensus route using window.location
	const checkIfInMassConsensus = () => {
		return window.location.pathname.includes('/mass-consensus');
	};

	// Hide soft prompts if we navigate to MassConsensus
	useEffect(() => {
		const handleLocationChange = () => {
			if (checkIfInMassConsensus()) {
				setShowNotificationPrompt(false);
				setShowInstallPrompt(false);
			}
		};

		// Listen for URL changes
		window.addEventListener('popstate', handleLocationChange);

		// Also check on initial render and when soft prompt state changes
		if (checkIfInMassConsensus()) {
			setShowNotificationPrompt(false);
			setShowInstallPrompt(false);
		}

		return () => {
			window.removeEventListener('popstate', handleLocationChange);
		};
	}, [showInstallPrompt, showNotificationPrompt]);

	// Auto-open soft prompts on success moments (intent milestones) with cooldown.
	useEffect(() => {
		const previous = previousIntentRef.current;
		const crossedGroupCreation = !previous.hasCreatedGroup && hasCreatedGroup;
		const crossedOptionsThreshold =
			previous.optionsCreated < PWA.MIN_OPTIONS_FOR_PROMPT &&
			optionsCreated >= PWA.MIN_OPTIONS_FOR_PROMPT;
		const reachedIntentMilestone = crossedGroupCreation || crossedOptionsThreshold;

		previousIntentRef.current = { hasCreatedGroup, optionsCreated };

		if (!reachedIntentMilestone || checkIfInMassConsensus()) {
			return;
		}

		if (
			canShowByCooldown(
				STORAGE_KEYS.PWA_INSTALL_SOFT_PROMPT_DISMISSED_AT,
				PWA.PROMPT_COOLDOWN * TIME.DAY,
			)
		) {
			setShowInstallPrompt(true);
		}

		// Note: notification prompt for intent milestones (group/options) still triggers here,
		// but the primary trigger is now discussion actions (see effect below).
		if (
			'Notification' in window &&
			Notification.permission === 'default' &&
			canShowByCooldown(
				STORAGE_KEYS.NOTIFICATION_SOFT_PROMPT_DISMISSED_AT,
				PWA.PROMPT_COOLDOWN * TIME.DAY,
			)
		) {
			setShowNotificationPrompt(true);
		}
	}, [hasCreatedGroup, optionsCreated]);

	// Show notification prompt after 3 actions in the same discussion.
	// This is the primary engagement-based trigger per the Hooked UX plan.
	useEffect(() => {
		if (!notificationPromptDiscussionId || checkIfInMassConsensus()) {
			return;
		}

		if (
			'Notification' in window &&
			Notification.permission === 'default' &&
			canShowByCooldown(
				STORAGE_KEYS.NOTIFICATION_SOFT_PROMPT_DISMISSED_AT,
				PWA.PROMPT_COOLDOWN * TIME.DAY,
			)
		) {
			setShowNotificationPrompt(true);
		}

		// Clear the trigger so it doesn't fire again in this session for the same discussion
		dispatch(clearNotificationPromptTrigger());
	}, [notificationPromptDiscussionId, dispatch]);

	useEffect(() => {
		// Skip all service worker operations for bots/crawlers.
		// They report serviceWorker support but can't register, causing false Sentry errors.
		if (isBot()) return;

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
			navigator.serviceWorker
				.getRegistrations()
				.then((registrations) => {
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
								const msg = error instanceof Error ? error.message : '';
								const isNetworkError =
									msg.includes('fetching the script') ||
									msg.includes('Failed to fetch') ||
									msg.includes('network');
								if (isNetworkError) {
									console.info(
										'[PWAWrapper] Firebase SW registration failed (network), will retry',
									);
								} else {
									logError(error, {
										operation: 'pwa.PWAWrapper.firebaseSW',
										metadata: {
											message: '[PWAWrapper] Firebase Messaging SW registration failed:',
										},
									});
								}
							});
					} else {
						console.info('[PWAWrapper] Firebase Messaging SW already registered');
					}
				})
				.catch((error: unknown) => logError(error, { operation: 'PWAWrapper.getRegistrations' }));
		} else if (isIOS() && !isInstalledPWA()) {
			console.info(
				'[PWAWrapper] iOS detected but not installed as PWA - push notifications require installing the app to home screen',
			);
		}

		let updateInterval: ReturnType<typeof setInterval> | undefined;

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

				// Check for updates periodically (every 4 hours)
				updateInterval = setInterval(() => {
					registration?.update().catch((err) => {
						// Network failures during periodic update checks are expected/transient
						const message = err instanceof TypeError ? err.message : '';
						if (message.includes('Failed to update a ServiceWorker') || message.includes('fetch')) {
							console.info(
								'[PWAWrapper] SW update check failed (network), will retry next interval',
							);
						} else {
							logError(err, {
								operation: 'pwa.PWAWrapper.updateInterval',
								metadata: { message: 'Error updating service worker:' },
							});
						}
					});
				}, 4 * TIME.HOUR);
			},
			onRegisterError(error) {
				const msg = error instanceof Error ? error.message : '';
				const isNetworkError =
					msg.includes('fetching the script') ||
					msg.includes('Failed to fetch') ||
					msg.includes('network');
				if (isNetworkError) {
					console.info('[PWAWrapper] SW registration failed (network), will retry on next load');
				} else {
					logError(error, {
						operation: 'pwa.PWAWrapper.unknown',
						metadata: { message: 'Service worker registration error:' },
					});
				}
			},
		});

		// Listen for notification permission changes
		const handlePermissionChange = () => {
			if (Notification.permission !== 'default') {
				setShowNotificationPrompt(false);
			}
		};

		// Open notification prompt from explicit user action events.
		const handleOpenNotificationPrompt = () => {
			if (
				'Notification' in window &&
				Notification.permission === 'default' &&
				!checkIfInMassConsensus()
			) {
				setShowNotificationPrompt(true);
			}
		};

		// Open install prompt from explicit user action events.
		const handleOpenInstallPrompt = () => {
			if (!checkIfInMassConsensus()) {
				setShowInstallPrompt(true);
			}
		};

		window.addEventListener('freedi:open-notification-prompt', handleOpenNotificationPrompt);
		window.addEventListener('freedi:open-install-prompt', handleOpenInstallPrompt);

		// Try to listen for permission changes (not supported in all browsers)
		if ('permissions' in navigator) {
			navigator.permissions
				.query({ name: 'notifications' as PermissionName })
				.then((permissionStatus) => {
					permissionStatus.onchange = handlePermissionChange;
				})
				.catch((error: unknown) => logError(error, { operation: 'PWAWrapper.permissionQuery' }));
		}

		return () => {
			if (updateInterval) {
				clearInterval(updateInterval);
			}
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
			}
			window.removeEventListener('freedi:open-notification-prompt', handleOpenNotificationPrompt);
			window.removeEventListener('freedi:open-install-prompt', handleOpenInstallPrompt);
		};
	}, []);

	return (
		<>
			{children}

			{/* Extracted manual triggers for install and notifications contextually */}
			{showNotificationPrompt && !checkIfInMassConsensus() && (
				<NotificationPrompt
					isOpen={true}
					onClose={(reason) => {
						if (reason === 'dismissed') {
							localStorage.setItem(
								STORAGE_KEYS.NOTIFICATION_SOFT_PROMPT_DISMISSED_AT,
								String(Date.now()),
							);
						}
						setShowNotificationPrompt(false);
					}}
				/>
			)}
			<InstallPWA
				isOpen={showInstallPrompt && !checkIfInMassConsensus()}
				onClose={() => setShowInstallPrompt(false)}
			/>
		</>
	);
};

export default PWAWrapper;

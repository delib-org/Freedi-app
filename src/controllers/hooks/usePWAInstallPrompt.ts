import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
	selectOptionsCreated,
	selectHasCreatedGroup,
	selectUserResponded,
	setInstallPromptShown,
	setPromptDismissed,
	setUserAcceptedInstall,
} from '@/redux/pwa/pwaSlice';
import { analyticsService } from '@/services/analytics/analytics';

import { logError } from '@/utils/errorHandling';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface UsePWAInstallPromptResult {
	/** Whether the install prompt should be shown */
	shouldShowPrompt: boolean;
	/** Whether the browser supports PWA installation */
	isInstallable: boolean;
	/** Whether the app is already installed */
	isAppInstalled: boolean;
	/** Show the install prompt */
	showPrompt: () => void;
	/** Handle install button click */
	handleInstall: () => Promise<void>;
	/** Handle dismiss button click */
	handleDismiss: () => void;
}

/**
 * Custom hook for managing PWA install prompt
 *
 * Handles:
 * - Capturing beforeinstallprompt event
 * - Determining when to show the prompt based on user actions
 * - Triggering the native install flow
 * - Tracking analytics events
 */
export const usePWAInstallPrompt = (): UsePWAInstallPromptResult => {
	const dispatch = useDispatch();

	// Redux state
	const optionsCreated = useSelector(selectOptionsCreated);
	const hasCreatedGroup = useSelector(selectHasCreatedGroup);
	const userResponded = useSelector(selectUserResponded);

	// Local state
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [shouldShowPrompt, setShouldShowPrompt] = useState(false);
	const [isInstallable, setIsInstallable] = useState(false);
	const [isAppInstalled, setIsAppInstalled] = useState(false);

	/**
	 * Check if app is already installed (running in standalone mode)
	 */
	const checkAppInstalled = useCallback((): boolean => {
		// Check if running in standalone mode (iOS)
		if (window.matchMedia('(display-mode: standalone)').matches) {
			return true;
		}
		// Check if running as installed PWA (Android/iOS)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((window.navigator as any).standalone === true) {
			return true;
		}
	}, []);
	// checkShouldShowPrompt removed as it was only used for automatic triggering

	/**
	 * Check if app is installed on mount
	 */
	useEffect(() => {
		const installed = checkAppInstalled();
		setIsAppInstalled(installed);

		if (installed) {
			console.info('[PWA] App is already installed');
		}
	}, [checkAppInstalled]);

	/**
	 * Capture the beforeinstallprompt event
	 */
	useEffect(() => {
		const handleBeforeInstallPrompt = (e: Event): void => {
			// Prevent the mini-infobar from appearing on mobile
			e.preventDefault();

			// Store the event for later use
			const promptEvent = e as BeforeInstallPromptEvent;
			setDeferredPrompt(promptEvent);
			setIsInstallable(true);

			console.info('[PWA] beforeinstallprompt event captured - app is installable');
		};

		const handleAppInstalled = (): void => {
			// Clear the deferred prompt
			setDeferredPrompt(null);
			setIsInstallable(false);
			setShouldShowPrompt(false);

			// Mark as accepted
			dispatch(setUserAcceptedInstall());

			// Track analytics
			const trigger = hasCreatedGroup ? 'group_created' : 'options_threshold';
			analyticsService.trackPWAInstalled(trigger, {
				optionsCount: optionsCreated,
				hasCreatedGroup,
			});
		};

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, [dispatch, hasCreatedGroup, optionsCreated]);

	/**
	 * Removed automatic prompt triggering based on time/thresholds.
	 * Components must now call `showPrompt()` based on explicit user actions.
	 */

	/**
	 * Manually show the prompt (for testing or manual trigger)
	 */
	const showPrompt = useCallback((): void => {
		if (isInstallable && !userResponded) {
			setShouldShowPrompt(true);
			dispatch(setInstallPromptShown(true));

			analyticsService.trackPWAInstallPromptShown('manual', {
				optionsCount: optionsCreated,
				hasCreatedGroup,
			});
		}
	}, [dispatch, isInstallable, userResponded, optionsCreated, hasCreatedGroup]);

	/**
	 * Handle install button click
	 */
	const handleInstall = useCallback(async (): Promise<void> => {
		if (!deferredPrompt) {
			return;
		}

		try {
			// Show the native install prompt
			await deferredPrompt.prompt();

			// Wait for the user's response
			const choiceResult = await deferredPrompt.userChoice;

			// Track the result
			const trigger = hasCreatedGroup ? 'group_created' : 'options_threshold';

			if (choiceResult.outcome === 'accepted') {
				analyticsService.trackPWAInstallAccepted(trigger, {
					optionsCount: optionsCreated,
					hasCreatedGroup,
				});

				dispatch(setUserAcceptedInstall());
			} else {
				analyticsService.trackPWAInstallDismissed(trigger, {
					optionsCount: optionsCreated,
					hasCreatedGroup,
				});

				dispatch(setPromptDismissed());
			}

			// Clear the deferred prompt
			setDeferredPrompt(null);
			setShouldShowPrompt(false);
		} catch (error) {
			logError(error, {
				operation: 'usePWAInstallPrompt.handleInstall',
				metadata: { optionsCreated, hasCreatedGroup },
			});
		}
	}, [deferredPrompt, dispatch, hasCreatedGroup, optionsCreated]);

	/**
	 * Handle dismiss button click
	 */
	const handleDismiss = useCallback((): void => {
		const trigger = hasCreatedGroup ? 'group_created' : 'options_threshold';

		analyticsService.trackPWAInstallDismissed(trigger, {
			optionsCount: optionsCreated,
			hasCreatedGroup,
		});

		dispatch(setPromptDismissed());
		setShouldShowPrompt(false);
	}, [dispatch, hasCreatedGroup, optionsCreated]);

	return {
		shouldShowPrompt,
		isInstallable,
		isAppInstalled,
		showPrompt,
		handleInstall,
		handleDismiss,
	};
};

/**
 * Service for platform detection and capability checking.
 *
 * Responsibilities:
 * - Detect iOS devices
 * - Check service worker support
 * - Check notification API support
 * - Check Firebase Messaging compatibility
 *
 * This service follows Single Responsibility Principle (SRP) by focusing
 * only on platform detection, extracted from NotificationService.
 */

/**
 * Check if service workers are supported in the current browser.
 */
export const isServiceWorkerSupported = (): boolean => 'serviceWorker' in navigator;

/**
 * Check if the Notification API is supported in the current browser.
 */
export const isNotificationSupported = (): boolean => 'Notification' in window;

/**
 * Check if the current device is running iOS.
 * This includes iPhones, iPads, iPods, and iPads running iPadOS (with desktop user agent).
 */
export const isIOS = (): boolean => {
	const userAgent = navigator.userAgent.toLowerCase();

	return (
		/iphone|ipad|ipod/.test(userAgent) ||
		// iPadOS 13+ uses desktop Safari user agent but has touch
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
};

/**
 * Check if the current device is running Android.
 */
export const isAndroid = (): boolean => {
	return /android/i.test(navigator.userAgent);
};

/**
 * Check if the current browser supports basic notifications.
 * This checks for both service worker and Notification API support.
 */
export const isBrowserNotificationsSupported = (): boolean => {
	return isServiceWorkerSupported() && isNotificationSupported();
};

/**
 * Check if Firebase Cloud Messaging (FCM) is supported.
 * FCM is NOT supported on iOS browsers.
 */
export const isFirebaseMessagingSupported = (): boolean => {
	// Firebase Messaging is not supported on iOS browsers
	if (isIOS()) {
		return false;
	}

	return isBrowserNotificationsSupported();
};

/**
 * Get the current platform name.
 */
export const getPlatformName = (): 'ios' | 'android' | 'web' => {
	if (isIOS()) return 'ios';
	if (isAndroid()) return 'android';

	return 'web';
};

/**
 * Get device information for diagnostics.
 */
export const getDeviceInfo = (): {
	userAgent: string;
	language: string;
	platform: string;
} => ({
	userAgent: navigator.userAgent,
	language: navigator.language,
	platform: getPlatformName(),
});

/**
 * PlatformService singleton for convenience.
 * Provides all platform detection methods as a single object.
 */
export const PlatformService = {
	isServiceWorkerSupported,
	isNotificationSupported,
	isIOS,
	isAndroid,
	isBrowserNotificationsSupported,
	isFirebaseMessagingSupported,
	getPlatformName,
	getDeviceInfo,
} as const;

/**
 * Service for platform detection and capability checking.
 *
 * Responsibilities:
 * - Detect iOS devices
 * - Check service worker support
 * - Check notification API support
 * - Check Firebase Messaging compatibility
 * - Detect PWA installation status
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
 * Check if the app is running as an installed PWA (standalone mode).
 * This is required for iOS Web Push support.
 */
export const isInstalledPWA = (): boolean => {
	// Check display-mode media query (works on most platforms)
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

	// Check iOS-specific standalone property
	const isIOSStandalone = 'standalone' in window.navigator &&
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true;

	// Check if launched from home screen on Android
	const isAndroidTWA = document.referrer.includes('android-app://');

	return isStandalone || isIOSStandalone || isAndroidTWA;
};

/**
 * Get the iOS version if running on iOS, otherwise null.
 * Returns major version number (e.g., 16 for iOS 16.4).
 */
export const getIOSVersion = (): number | null => {
	if (!isIOS()) return null;

	const match = navigator.userAgent.match(/OS (\d+)_/);
	if (match && match[1]) {
		return parseInt(match[1], 10);
	}

	return null;
};

/**
 * Check if the device supports iOS Web Push (iOS 16.4+).
 * Web Push on iOS requires:
 * 1. iOS 16.4 or later
 * 2. App installed as PWA (Add to Home Screen)
 * 3. Running in standalone mode
 */
export const isIOSWebPushSupported = (): boolean => {
	if (!isIOS()) return false;

	const iosVersion = getIOSVersion();

	// iOS 16.4+ supports Web Push for installed PWAs
	// We check for 16 because we can't reliably detect minor version from UA
	if (iosVersion === null || iosVersion < 16) return false;

	// Must be installed as PWA
	if (!isInstalledPWA()) return false;

	// Check if Push API is available
	if (!('PushManager' in window)) return false;

	return true;
};

/**
 * Check if the current browser supports basic notifications.
 * This checks for both service worker and Notification API support.
 */
export const isBrowserNotificationsSupported = (): boolean => {
	return isServiceWorkerSupported() && isNotificationSupported();
};

/**
 * Check if Firebase Cloud Messaging (FCM) / Web Push is supported.
 * Supported on:
 * - Chrome, Firefox, Edge, Safari on desktop
 * - Chrome on Android
 * - iOS 16.4+ Safari when installed as PWA
 */
export const isFirebaseMessagingSupported = (): boolean => {
	// Check basic browser support first
	if (!isBrowserNotificationsSupported()) {
		return false;
	}

	// For iOS, only support if it's an installed PWA on iOS 16.4+
	if (isIOS()) {
		return isIOSWebPushSupported();
	}

	return true;
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
	isInstalledPWA,
	getIOSVersion,
	isIOSWebPushSupported,
	isBrowserNotificationsSupported,
	isFirebaseMessagingSupported,
	getPlatformName,
	getDeviceInfo,
} as const;

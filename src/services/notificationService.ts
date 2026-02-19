/**
 * Notification Service - Orchestrates notification functionality.
 *
 * This service acts as a facade that coordinates:
 * - PlatformService: Platform detection and capability checking
 * - PushService: Firebase Cloud Messaging operations
 * - NotificationRepository: Firestore persistence for tokens and subscriptions
 *
 * The service follows the Facade pattern, providing a unified interface
 * while delegating to specialized services that each follow SRP.
 */

import type { MessagePayload } from 'firebase/messaging';
import { PlatformService, isBrowserNotificationsSupported } from './platformService';
import {
	PushService,
	waitForServiceWorker,
	initializeMessaging,
	getOrRefreshToken,
	setupForegroundListener,
	deleteCurrentToken,
	setNotificationHandler as setPushNotificationHandler,
} from './pushService';
import {
	storeToken,
	deleteToken as deleteTokenFromDb,
	getTokenLastRefresh,
	registerForStatementNotifications as registerInDb,
	unregisterFromStatementNotifications as unregisterInDb,
	syncTokenWithSubscriptions as syncTokenInDb,
	removeTokenFromAllSubscriptions as removeTokenFromAllSubs,
	TokenMetadata,
} from './notificationRepository';
import { logError } from '@/utils/errorHandling';

// Re-export TokenMetadata for backward compatibility
export type { TokenMetadata };

/**
 * Notification Service singleton class.
 * Orchestrates platform, push, and repository services.
 */
export class NotificationService {
	private static instance: NotificationService;
	private token: string | null = null;
	private isTokenSentToServer = false;
	private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private userId: string | null = null;

	private constructor() {
		// Singleton pattern
	}

	/**
	 * Get the singleton instance of NotificationService.
	 */
	public static getInstance(): NotificationService {
		if (!NotificationService.instance) {
			NotificationService.instance = new NotificationService();
		}

		return NotificationService.instance;
	}

	/**
	 * Check if the browser supports notifications.
	 */
	public isSupported(): boolean {
		return isBrowserNotificationsSupported();
	}

	/**
	 * Safe way to check notification permission.
	 */
	public safeGetPermission(): NotificationPermission | 'unsupported' {
		return PushService.safeGetPermission();
	}

	/**
	 * Request permission to show notifications.
	 */
	public async requestPermission(): Promise<boolean> {
		return PushService.requestPermission();
	}

	/**
	 * Initialize the notification service.
	 */
	public async initialize(userId: string): Promise<void> {
		if (!this.isSupported()) {
			return;
		}

		try {
			this.userId = userId;

			// Wait for service worker
			await waitForServiceWorker();

			// Initialize Firebase Messaging
			if (!(await initializeMessaging())) {
				logError(new Error('[NotificationService] Failed to initialize messaging'), { operation: 'services.notificationService.unknown' });

				return;
			}

			// Check notification permission
			const permission = await this.requestPermission();
			if (!permission) {
				return;
			}

			// Set up foreground message listener
			await setupForegroundListener();

			// Get FCM token
			const token = await this.getOrRefreshToken(userId);

			if (token) {
				console.info('[NotificationService] Token registered in pushNotifications collection');
				this.setupTokenRefresh(userId);

				// Sync token with existing subscriptions that have push notifications enabled
				// This ensures the new token is added to all push-enabled subscriptions
				try {
					await syncTokenInDb(userId, token);
					console.info('[NotificationService] Token synced with existing subscriptions');
				} catch (error) {
					logError(error, { operation: 'services.notificationService.unknown', metadata: { message: '[NotificationService] Error syncing token with subscriptions:' } });
				}
			} else {
				console.info(
					'[NotificationService] Initialized without FCM token - browser notifications only',
				);
			}
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: '[NotificationService] Error during initialization:' } });
		}
	}

	/**
	 * Set up automatic token refresh.
	 */
	private setupTokenRefresh(userId: string): void {
		if (this.tokenRefreshTimer) {
			clearInterval(this.tokenRefreshTimer);
		}

		// Check token freshness on startup
		this.checkTokenFreshness(userId);

		// Set up periodic refresh check (every 24 hours)
		this.tokenRefreshTimer = setInterval(
			() => {
				this.checkTokenFreshness(userId);
			},
			24 * 60 * 60 * 1000,
		);
	}

	/**
	 * Check if token needs refresh and refresh if necessary.
	 */
	private async checkTokenFreshness(userId: string): Promise<void> {
		if (!this.token) return;

		try {
			const lastRefresh = await getTokenLastRefresh(this.token);

			if (!lastRefresh) {
				await this.getOrRefreshToken(userId, true);

				return;
			}

			const timeSinceRefresh = Date.now() - lastRefresh.getTime();
			const refreshInterval = PushService.getTokenRefreshInterval();

			if (timeSinceRefresh > refreshInterval) {
				await this.getOrRefreshToken(userId, true);
			}
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error checking token freshness:' } });
		}
	}

	/**
	 * Get a new FCM token or refresh an existing one.
	 */
	public async getOrRefreshToken(
		userId: string,
		forceRefresh: boolean = false,
	): Promise<string | null> {
		try {
			const currentToken = await getOrRefreshToken(forceRefresh);

			if (currentToken) {
				const tokenChanged = this.token !== currentToken;
				this.token = currentToken;

				// Send token to server if new or changed
				if (!this.isTokenSentToServer || tokenChanged || forceRefresh) {
					await storeToken(userId, currentToken);
					this.isTokenSentToServer = true;
				}

				return currentToken;
			} else {
				this.token = null;
				this.isTokenSentToServer = false;

				return null;
			}
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: '[NotificationService] Error getting FCM token:' } });

			return null;
		}
	}

	/**
	 * Register for statement notifications.
	 */
	public async registerForStatementNotifications(
		userId: string,
		token: string | null,
		statementId: string,
	): Promise<boolean> {
		if (!this.isSupported()) {
			return false;
		}

		try {
			let tokenToUse = token || this.token;

			if (!tokenToUse) {
				tokenToUse = await this.getOrRefreshToken(userId);
			}

			if (!tokenToUse) {
				logError(new Error('No FCM token available to register for notifications'), { operation: 'services.notificationService.unknown' });

				return false;
			}

			await registerInDb(userId, tokenToUse, statementId);

			return true;
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error registering for statement notifications:' } });

			return false;
		}
	}

	/**
	 * Unregister from statement notifications.
	 */
	public async unregisterFromStatementNotifications(statementId: string): Promise<boolean> {
		try {
			if (!this.token || !this.userId) {
				logError(new Error('No token or user available to unregister'), { operation: 'services.notificationService.unknown' });

				return false;
			}

			await unregisterInDb(this.token, statementId, this.userId);

			return true;
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error unregistering from statement notifications:' } });

			return false;
		}
	}

	/**
	 * Clean up on user logout.
	 */
	public async cleanup(): Promise<void> {
		try {
			// Clear token refresh timer immediately
			if (this.tokenRefreshTimer) {
				clearInterval(this.tokenRefreshTimer);
				this.tokenRefreshTimer = null;
			}

			// Store values for cleanup operations
			const tokenToClean = this.token;
			const userIdToClean = this.userId;

			// Reset state immediately for faster logout
			this.token = null;
			this.isTokenSentToServer = false;
			this.userId = null;

			// Perform cleanup operations in parallel
			const cleanupPromises: Promise<void>[] = [];

			if (tokenToClean && userIdToClean) {
				// Remove from database
				cleanupPromises.push(deleteTokenFromDb(tokenToClean));

				// Remove token from all subscriptions
				cleanupPromises.push(
					removeTokenFromAllSubs(userIdToClean, tokenToClean).catch((error) => {
						if (!error?.message?.includes('Null value error')) {
							logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error removing token from subscriptions:' } });
						}
					}),
				);
			}

			// Delete local FCM token
			cleanupPromises.push(deleteCurrentToken());

			await Promise.allSettled(cleanupPromises);
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error during cleanup:' } });
		}
	}

	/**
	 * Register a handler for receiving notifications.
	 */
	public setNotificationHandler(handler: (payload: MessagePayload) => void): void {
		setPushNotificationHandler(handler);
	}

	/**
	 * Check if the user has granted notification permission.
	 */
	public hasPermission(): boolean {
		return PushService.hasPermission();
	}

	/**
	 * Get the current FCM token.
	 */
	public getToken(): string | null {
		return this.token;
	}

	/**
	 * Get the current user ID.
	 */
	public getCurrentUserId(): string | null {
		return this.userId;
	}

	/**
	 * Check if the service is initialized.
	 */
	public isInitialized(): boolean {
		return PushService.isInitialized() && !!this.token;
	}

	/**
	 * Sync current token with all user's statement subscriptions.
	 */
	public async syncTokenWithSubscriptions(userId: string): Promise<void> {
		if (!this.token) {
			logError(new Error('No token available to sync'), { operation: 'services.notificationService.unknown' });

			return;
		}

		try {
			await syncTokenInDb(userId, this.token);
		} catch (error) {
			logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error syncing token with subscriptions:' } });
		}
	}

	/**
	 * Remove token from all user's subscriptions.
	 */
	public async removeTokenFromAllSubscriptions(userId: string, token: string): Promise<void> {
		try {
			await removeTokenFromAllSubs(userId, token);
		} catch (error) {
			const err = error as { message?: string };
			if (err?.message && !err.message.includes('Null value error')) {
				logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error removing token from subscriptions:' } });
			}
		}
	}

	/**
	 * Get diagnostic information for troubleshooting.
	 */
	public async getDiagnostics(): Promise<{
		supported: boolean;
		permission: NotificationPermission | 'unsupported';
		hasToken: boolean;
		token: string | null;
		tokenAge: number | null;
		serviceWorkerReady: boolean;
		userId: string | null;
		isInitialized: boolean;
		lastTokenUpdate: Date | null;
		platform: string;
	}> {
		const diagnostics = {
			supported: this.isSupported(),
			permission: this.safeGetPermission(),
			hasToken: !!this.token,
			token: this.token,
			tokenAge: null as number | null,
			serviceWorkerReady: false,
			userId: this.userId,
			isInitialized: this.isInitialized(),
			lastTokenUpdate: null as Date | null,
			platform: PlatformService.getPlatformName(),
		};

		// Check service worker
		if (PlatformService.isServiceWorkerSupported()) {
			try {
				const registration = await navigator.serviceWorker.getRegistration();
				diagnostics.serviceWorkerReady = !!registration?.active;
			} catch (error) {
				logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error checking service worker:' } });
			}
		}

		// Check token age
		if (this.token) {
			try {
				const lastRefresh = await getTokenLastRefresh(this.token);
				if (lastRefresh) {
					diagnostics.tokenAge = Date.now() - lastRefresh.getTime();
					diagnostics.lastTokenUpdate = lastRefresh;
				}
			} catch (error) {
				logError(error, { operation: 'services.notificationService.unknown', metadata: { message: 'Error getting token age:' } });
			}
		}

		return diagnostics;
	}
}

// Export a singleton instance
export const notificationService = NotificationService.getInstance();

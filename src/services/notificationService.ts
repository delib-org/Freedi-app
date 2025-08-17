import { getMessaging, getToken, onMessage, deleteToken, Messaging, MessagePayload } from "firebase/messaging";
import { app, DB } from "@/controllers/db/config";
import { vapidKey } from "@/controllers/db/configKey";
import { setDoc, doc, getFirestore, deleteDoc, getDoc, Timestamp, getDocs, query, where, collection } from "firebase/firestore";
import { Collections } from "delib-npm";
import { addTokenToSubscription, removeTokenFromSubscription } from "@/controllers/db/subscriptions/setSubscriptions";

// Helper function to check if service workers are supported
const isServiceWorkerSupported = () => 'serviceWorker' in navigator;
// Helper function to check if notifications are supported
const isNotificationSupported = () => 'Notification' in window;

// Initialize Firebase components that don't require service workers
const db = getFirestore(app);

// Token refresh interval (30 days in milliseconds)
const TOKEN_REFRESH_INTERVAL = 30 * 24 * 60 * 60 * 1000;

interface TokenMetadata {
	token: string;
	userId: string;
	lastUpdate: Date | Timestamp;
	lastRefresh: Date | Timestamp;
	platform: string;
	deviceInfo: {
		userAgent: string;
		language: string;
	};
}

/**
 * Service for handling push notifications using Firebase Cloud Messaging
 */
export class NotificationService {
	private static instance: NotificationService;
	private token: string | null = null;
	private isTokenSentToServer = false;
	private notificationHandler: ((payload: MessagePayload) => void) | null = null;
	private messaging: Messaging | null = null; // Initialized lazily when needed
	private browserSupportsNotifications: boolean;
	private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private userId: string | null = null;

	private constructor() {
		// Singleton pattern
		this.browserSupportsNotifications = this.isSupported();
	}

	/**
	 * Get the singleton instance of NotificationService
	 */
	public static getInstance(): NotificationService {
		if (!NotificationService.instance) {
			NotificationService.instance = new NotificationService();
		}

		return NotificationService.instance;
	}

	/**
	 * Check if the browser supports notifications and service workers
	 */
	public isSupported(): boolean {
		return isServiceWorkerSupported() && isNotificationSupported();
	}

	/**
	 * Safe way to check notification permission that works on all browsers
	 * including iOS where Notification API might exist but not be fully supported
	 */
	public safeGetPermission(): NotificationPermission | 'unsupported' {
		if (!this.isSupported()) {
			return 'unsupported';
		}

		try {
			return Notification.permission;
		} catch (error) {
			console.error('Error accessing Notification.permission:', error);

			return 'unsupported';
		}
	}

	/**
	 * Initialize Firebase Messaging safely
	 */
	private initializeMessaging(): boolean {
		if (!this.isSupported()) {
			// Browser does not support notifications

			return false;
		}

		try {
			if (!this.messaging) {
				// Create Firebase Messaging instance
				this.messaging = getMessaging(app);
			}

			return true;
		} catch (error) {
			console.error('[NotificationService] Failed to initialize Firebase Messaging:', error);
			console.error('[NotificationService] Error details:', {
				name: (error as Error).name,
				message: (error as Error).message,
				stack: (error as Error).stack
			});

			return false;
		}
	}

	/**
	 * Request permission to show notifications
	 * @returns A promise that resolves with a boolean indicating if permission was granted
	 */
	public async requestPermission(): Promise<boolean> {
		if (!this.isSupported()) {
			// Browser does not support notifications

			return false;
		}

		try {
			const permission = await Notification.requestPermission();

			return permission === 'granted';
		} catch (error) {
			console.error('Failed to request notification permission:', error);

			return false;
		}
	}

	/**
	 * Initialize the notification service and request FCM token
	 * @param userId The user ID to associate with the token
	 * @returns A promise that resolves when initialization is complete
	 */
	public async initialize(userId: string): Promise<void> {
		// Start initialization for user
		
		if (!this.isSupported()) {
			// Browser does not support required features
			
return;
		}

		try {
			this.userId = userId;

			// Wait for service worker to be ready first
			// Wait for service worker
			await this.waitForServiceWorker();

			// Initialize messaging first
			// Initialize Firebase Messaging
			if (!this.initializeMessaging()) {
				console.error('[NotificationService] Failed to initialize messaging');
				
return;
			}

			// Check notification permission
			const permission = await this.requestPermission();

			if (!permission) {
				// Permission not granted
				
return;
			}

			// Permission granted, set up listeners
			// Listen for foreground messages
			this.setupForegroundListener();

			// Get FCM token
			await this.getOrRefreshToken(userId);
			// Token result processed

			// Sync token with all user's subscriptions
			if (this.token) {
				await this.syncTokenWithSubscriptions(userId);
			}

			// Set up automatic token refresh
			this.setupTokenRefresh(userId);
			
			// Initialization complete
		} catch (error) {
			console.error('[NotificationService] Error during initialization:', error);
		}
	}

	/**
	 * Set up automatic token refresh
	 */
	private setupTokenRefresh(userId: string): void {
		// Clear any existing timer
		if (this.tokenRefreshTimer) {
			clearInterval(this.tokenRefreshTimer);
		}

		// Check token freshness on startup
		this.checkTokenFreshness(userId);

		// Set up periodic refresh check (every 24 hours)
		this.tokenRefreshTimer = setInterval(() => {
			this.checkTokenFreshness(userId);
		}, 24 * 60 * 60 * 1000);
	}

	/**
	 * Check if token needs refresh and refresh if necessary
	 */
	private async checkTokenFreshness(userId: string): Promise<void> {
		if (!this.token) return;

		try {
			// Get token metadata from Firestore
			const tokenDoc = await getDoc(doc(db, 'pushNotifications', this.token));
			
			if (!tokenDoc.exists()) {
				// Token not in database, refresh it
				await this.getOrRefreshToken(userId, true);
				
return;
			}

			const metadata = tokenDoc.data() as TokenMetadata;
			const lastRefresh = this.convertToDate(metadata.lastRefresh) || this.convertToDate(metadata.lastUpdate);
			
			if (!lastRefresh) {
				// No refresh date, refresh token
				await this.getOrRefreshToken(userId, true);
				
return;
			}

			const timeSinceRefresh = Date.now() - lastRefresh.getTime();
			
			if (timeSinceRefresh > TOKEN_REFRESH_INTERVAL) {
				// Token needs refresh, refreshing
				await this.getOrRefreshToken(userId, true);
			}
		} catch (error) {
			console.error('Error checking token freshness:', error);
		}
	}

	/**
	 * Get a new FCM token or refresh an existing one
	 * @param userId The user ID to associate with the token
	 * @param forceRefresh Force a new token even if one exists
	 * @returns The FCM token
	 */
	public async getOrRefreshToken(userId: string, forceRefresh: boolean = false): Promise<string | null> {
		// Get or refresh token
		
		if (!this.isSupported()) {
			// Browser not supported
			
return null;
		}

		try {
			// Initialize messaging if not already done
			if (!this.initializeMessaging()) {
				console.error('[NotificationService] Failed to initialize messaging in getOrRefreshToken');
				
return null;
			}

			// Request permission first if not granted
			if (Notification.permission !== 'granted') {
				// Permission not granted, requesting
				const permissionGranted = await this.requestPermission();
				if (!permissionGranted) {
					// Permission denied by user
					
return null;
				}
			}

			// Delete old token if force refresh
			if (forceRefresh && this.token) {
				try {
					await deleteToken(this.messaging);
					// Old token deleted
				} catch (error) {
					console.error('[NotificationService] Error deleting old token:', error);
				}
			}

			// Check service worker registration
			// Get service worker registration
			const swRegistration = await navigator.serviceWorker.getRegistration();
			// Check service worker registration
			
			if (!swRegistration) {
				console.error('[NotificationService] No service worker registration found!');
				
return null;
			}

			// Get token
			// Request FCM token with VAPID key
			
			if (!vapidKey || vapidKey === 'undefined' || vapidKey.length < 10) {
				console.error('[NotificationService] VAPID key is missing or invalid! Check VITE_FIREBASE_VAPID_KEY in .env');
				
return null;
			}
			
			const currentToken = await getToken(this.messaging, {
				vapidKey,
				serviceWorkerRegistration: swRegistration
			});

			if (currentToken) {
				// Token received successfully
				// Check if token changed
				const tokenChanged = this.token !== currentToken;
				this.token = currentToken;

				// Send token to server if new or changed
				if (!this.isTokenSentToServer || tokenChanged || forceRefresh) {
					await this.sendTokenToServer(userId, currentToken);
					this.isTokenSentToServer = true;
				}

				return currentToken;
			} else {
				console.error('[NotificationService] No token received from getToken()');
				this.token = null;
				this.isTokenSentToServer = false;

				return null;
			}
		} catch (error) {
			console.error('[NotificationService] Error getting FCM token:', error);
			console.error('[NotificationService] Error details:', {
				name: (error as Error).name,
				message: (error as Error).message,
				stack: (error as Error).stack
			});

			return null;
		}
	}

	/**
	 * Send the FCM token to the server to associate with the user
	 * @param userId The user ID to associate with the token
	 * @param token The FCM token
	 */
	private async sendTokenToServer(userId: string, token: string): Promise<void> {
		try {
			const tokenMetadata: TokenMetadata = {
				token,
				userId,
				lastUpdate: new Date(),
				lastRefresh: new Date(),
				platform: 'web',
				deviceInfo: {
					userAgent: navigator.userAgent,
					language: navigator.language
				}
			};

			// Store token in pushNotifications collection
			await setDoc(doc(db, 'pushNotifications', token), tokenMetadata, { merge: true });

			// FCM token stored in database
			this.isTokenSentToServer = true;
		} catch (error) {
			console.error('Error sending token to server:', error);
			this.isTokenSentToServer = false;
		}
	}

	/**
	 * Register user's interest in receiving notifications for a specific statement
	 * @param userId User's ID
	 * @param token FCM token
	 * @param statementId Statement ID to subscribe to
	 */
	public async registerForStatementNotifications(
		userId: string,
		token: string | null,
		statementId: string
	): Promise<boolean> {
		if (!this.isSupported()) {
			// Browser does not support notifications

			return false;
		}

		try {
			if (!token) {
				// If no token is provided, try to get one
				token = this.token;

				// If still no token, try to refresh
				if (!token) {
					token = await this.getOrRefreshToken(userId);
				}

				// If still no token, fail
				if (!token) {
					console.error('No FCM token available to register for notifications');

					return false;
				}
			}

			// Store in askedToBeNotified collection (for backward compatibility)
			const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
			await setDoc(notificationRef, {
				token,
				userId,
				statementId,
				lastUpdate: new Date(),
				subscribed: true
			}, { merge: true });

			// Also add token to the statement subscription
			await addTokenToSubscription(statementId, userId, token);

			// Registered for notifications

			return true;
		} catch (error) {
			console.error('Error registering for statement notifications:', error);

			return false;
		}
	}

	/**
	 * Unregister from statement notifications
	 */
	public async unregisterFromStatementNotifications(
		statementId: string
	): Promise<boolean> {
		try {
			if (!this.token) {
				console.error('No token available to unregister');
				
return false;
			}

			const notificationRef = doc(DB, Collections.askedToBeNotified, `${this.token}_${statementId}`);
			await deleteDoc(notificationRef);

			// Also remove token from statement subscription
			if (this.userId) {
				await removeTokenFromSubscription(statementId, this.userId, this.token);
			}

			// Unregistered from notifications
			
return true;
		} catch (error) {
			console.error('Error unregistering from statement notifications:', error);
			
return false;
		}
	}

	/**
	 * Clean up on user logout
	 */
	public async cleanup(): Promise<void> {
		try {
			// Clear token refresh timer
			if (this.tokenRefreshTimer) {
				clearInterval(this.tokenRefreshTimer);
				this.tokenRefreshTimer = null;
			}

			// Delete token from server
			if (this.token && this.userId) {
				// Remove from pushNotifications collection
				await deleteDoc(doc(db, 'pushNotifications', this.token));

				// Remove token from all user's subscriptions
				await this.removeTokenFromAllSubscriptions(this.userId, this.token);

				// Remove all askedToBeNotified entries for this token
				// This would need a query to find all documents with this token
				// Token removed from server
			}

			// Delete local token
			if (this.messaging && this.token) {
				try {
					await deleteToken(this.messaging);
				} catch (error) {
					console.error('Error deleting FCM token:', error);
				}
			}

			// Reset state
			this.token = null;
			this.isTokenSentToServer = false;
			this.userId = null;
		} catch (error) {
			console.error('Error during cleanup:', error);
		}
	}

	/**
	 * Set up a listener for foreground messages
	 */
	private setupForegroundListener(): void {
		if (!this.isSupported() || !this.messaging) {
			return;
		}

		onMessage(this.messaging, (payload) => {
			// Message received in foreground

			// If we have a notification payload, show it
			if (payload.notification) {
				this.showForegroundNotification(payload);
			}

			// Call the registered handler if one exists
			if (this.notificationHandler) {
				this.notificationHandler(payload);
			}
		});
	}

	/**
	 * Display a notification when the app is in the foreground
	 * @param payload The FCM message payload
	 */
	private showForegroundNotification(payload: MessagePayload): void {
		if (!this.isSupported()) {
			return;
		}

		const notificationTitle = payload.notification?.title || 'FreeDi App';
		const notificationOptions = {
			body: payload.notification?.body || '',
			icon: '/icons/logo-192px.png',
			badge: '/icons/logo-48px.png',
			vibrate: [100, 50, 100],
			tag: payload.data?.tag || 'default',
			data: payload.data,
			requireInteraction: true,
			actions: [
				{
					action: 'open',
					title: 'Open'
				}
			]
		};

		// Play notification sound
		this.playNotificationSound();

		// Show notification if permission is granted
		if (Notification.permission === 'granted') {
			navigator.serviceWorker.ready.then(registration => {
				registration.showNotification(notificationTitle, notificationOptions);
			});
		}
	}

	/**
	 * Play a notification sound
	 */
	private playNotificationSound(): void {
		try {
			const audio = new Audio('/assets/sounds/bell.mp3');
			audio.play().catch(error => console.error('Error playing notification sound:', error));
		} catch (error) {
			console.error('Error playing notification sound:', error);
		}
	}

	/**
	 * Register a handler for receiving notifications
	 * @param handler A function that will be called with the notification payload
	 */
	public setNotificationHandler(handler: (payload: MessagePayload) => void): void {
		this.notificationHandler = handler;
	}

	/**
	 * Check if the user has granted notification permission
	 * @returns True if notification permission is granted
	 */
	public hasPermission(): boolean {
		return isNotificationSupported() && Notification.permission === 'granted';
	}

	/**
	 * Get the current FCM token
	 * @returns The current FCM token or null if not available
	 */
	public getToken(): string | null {
		return this.token;
	}

	/**
	 * Get the current user ID
	 * @returns The current user ID or null if not set
	 */
	public getCurrentUserId(): string | null {
		return this.userId;
	}

	/**
	 * Check if the service is initialized
	 * @returns True if the service has been initialized
	 */
	public isInitialized(): boolean {
		return !!this.messaging && !!this.token;
	}

	/**
	 * Convert Firestore Timestamp or Date to JavaScript Date
	 */
	private convertToDate(dateOrTimestamp: Date | Timestamp | undefined): Date | null {
		if (!dateOrTimestamp) return null;
		
		if (dateOrTimestamp instanceof Date) {
			return dateOrTimestamp;
		}
		
		// Check if it's a Firestore Timestamp (has toDate method)
		if (typeof dateOrTimestamp === 'object' && 'toDate' in dateOrTimestamp) {
			return dateOrTimestamp.toDate();
		}
		
		return null;
	}

	/**
	 * Wait for service worker to be ready
	 */
	private async waitForServiceWorker(): Promise<void> {
		if (!('serviceWorker' in navigator)) {
			throw new Error('Service workers not supported');
		}

		try {
			// First, list all registrations
			const allRegistrations = await navigator.serviceWorker.getRegistrations();
			// Check all service worker registrations

			// Check if firebase-messaging-sw.js is already registered
			let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
			
			if (!registration) {
				// Try to find it in all registrations
				registration = allRegistrations.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));
				if (registration) {
					// Found Firebase messaging SW in registrations
				}
			}
			
			if (!registration) {
				// Firebase messaging SW not found, waiting for registration
				// Wait for the service worker to be registered by PWAWrapper
				await new Promise<void>((resolve) => {
					const checkInterval = setInterval(async () => {
						const regs = await navigator.serviceWorker.getRegistrations();
						registration = regs.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));
						if (registration && registration.active) {
							clearInterval(checkInterval);
							// Firebase messaging SW is now active
							resolve();
						}
					}, 500);

					// Timeout after 10 seconds
					setTimeout(() => {
						clearInterval(checkInterval);
						console.error('[NotificationService] Timeout waiting for service worker');
						resolve(); // Resolve anyway to continue
					}, 10000);
				});
			} else if (!registration.active) {
				// Service worker found but not active, waiting...
				await navigator.serviceWorker.ready;
				// Service worker is now ready
			} else {
				// Firebase messaging SW already active
			}
		} catch (error) {
			console.error('[NotificationService] Error waiting for service worker:', error);
		}
	}

	/**
	 * Sync current token with all user's statement subscriptions
	 * This ensures all subscriptions have the current device token
	 */
	public async syncTokenWithSubscriptions(userId: string): Promise<void> {
		if (!this.token) {
			console.error('No token available to sync');
			
return;
		}

		try {
			// Get all user's subscriptions
			const subscriptionsQuery = query(
				collection(db, Collections.statementsSubscribe),
				where('userId', '==', userId),
				where('getPushNotification', '==', true)
			);
			
			const subscriptionsSnapshot = await getDocs(subscriptionsQuery);
			
			// Add current token to all subscriptions
			const updatePromises = subscriptionsSnapshot.docs.map(doc => {
				const subscription = doc.data();
				const statementId = subscription.statementId || subscription.statement?.statementId;
				
				if (!statementId) {
					console.error('No statementId found in subscription:', doc.id);

					return Promise.resolve();
				}
				
				return addTokenToSubscription(statementId, userId, this.token!);
			});
			
			await Promise.all(updatePromises);
			console.info(`Synced token with ${updatePromises.length} subscriptions`);
		} catch (error) {
			console.error('Error syncing token with subscriptions:', error);
		}
	}

	/**
	 * Remove token from all user's subscriptions (used on logout or token refresh)
	 */
	public async removeTokenFromAllSubscriptions(userId: string, token: string): Promise<void> {
		try {
			// Get all user's subscriptions
			const subscriptionsQuery = query(
				collection(db, Collections.statementsSubscribe),
				where('userId', '==', userId)
			);
			
			const subscriptionsSnapshot = await getDocs(subscriptionsQuery);
			
			// Remove token from all subscriptions
			const removePromises = subscriptionsSnapshot.docs.map(doc => {
				const subscription = doc.data();
				const statementId = subscription.statementId || subscription.statement?.statementId;
				
				if (!statementId) {
					console.error('No statementId found in subscription:', doc.id);

					return Promise.resolve();
				}
				
				return removeTokenFromSubscription(statementId, userId, token);
			});
			
			await Promise.all(removePromises);
			console.info(`Removed token from ${removePromises.length} subscriptions`);
		} catch (error) {
			console.error('Error removing token from subscriptions:', error);
		}
	}

	/**
	 * Get diagnostic information for troubleshooting
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
	}> {
		const diagnostics = {
			supported: this.isSupported(),
			permission: this.safeGetPermission(),
			hasToken: !!this.token,
			token: this.token,
			tokenAge: null as number | null,
			serviceWorkerReady: false,
			userId: this.userId,
			isInitialized: !!this.messaging,
			lastTokenUpdate: null as Date | null
		};

		// Check service worker
		if (isServiceWorkerSupported()) {
			try {
				const registration = await navigator.serviceWorker.getRegistration();
				diagnostics.serviceWorkerReady = !!registration?.active;
			} catch (error) {
				console.error('Error checking service worker:', error);
			}
		}

		// Check token age and get last update
		if (this.token) {
			try {
				const tokenDoc = await getDoc(doc(db, 'pushNotifications', this.token));
				if (tokenDoc.exists()) {
					const metadata = tokenDoc.data() as TokenMetadata;
					const lastRefresh = this.convertToDate(metadata.lastRefresh) || this.convertToDate(metadata.lastUpdate);
					if (lastRefresh) {
						diagnostics.tokenAge = Date.now() - lastRefresh.getTime();
						diagnostics.lastTokenUpdate = lastRefresh;
					}
				}
			} catch (error) {
				console.error('Error getting token age:', error);
			}
		}

		// Return diagnostics data

		return diagnostics;
	}
}

// Export a singleton instance
export const notificationService = NotificationService.getInstance();
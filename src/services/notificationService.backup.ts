import { getMessaging, getToken, onMessage, Messaging, MessagePayload } from "firebase/messaging";
import { app, DB } from "@/controllers/db/config";
import { vapidKey } from "@/controllers/db/configKey";
import { setDoc, doc, getFirestore } from "firebase/firestore";
import { Collections } from "delib-npm";

// Helper function to check if service workers are supported
const isServiceWorkerSupported = () => 'serviceWorker' in navigator;
// Helper function to check if notifications are supported
const isNotificationSupported = () => 'Notification' in window;

// Initialize Firebase components that don't require service workers
const db = getFirestore(app);

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
			console.info('This browser does not support the required features for notifications');

			return false;
		}

		try {
			if (!this.messaging) {
				this.messaging = getMessaging(app);
			}

			return true;
		} catch (error) {
			console.error('Failed to initialize Firebase Messaging:', error);

			return false;
		}
	}

	/**
	 * Request permission to show notifications
	 * @returns A promise that resolves with a boolean indicating if permission was granted
	 */
	public async requestPermission(): Promise<boolean> {
		if (!this.isSupported()) {
			console.info('This browser does not support the required features for notifications');

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
		if (!this.isSupported()) {
			console.info('This browser does not support the required features for notifications');

			return;
		}

		try {
			// Initialize messaging first
			if (!this.initializeMessaging()) {
				return;
			}

			const permission = await this.requestPermission();

			if (!permission) {
				console.info('Notification permission not granted');

				return;
			}

			// Listen for foreground messages
			this.setupForegroundListener();

			// Get FCM token
			await this.getOrRefreshToken(userId);
		} catch (error) {
			console.error('Error initializing notifications:', error);
		}
	}

	/**
	 * Get a new FCM token or refresh an existing one
	 * @param userId The user ID to associate with the token
	 * @returns The FCM token
	 */
	public async getOrRefreshToken(userId: string): Promise<string | null> {
		if (!this.isSupported()) {
			return null;
		}

		try {
			// Initialize messaging if not already done
			if (!this.initializeMessaging()) {
				return null;
			}

			// Request permission first if not granted
			if (Notification.permission !== 'granted') {
				const permissionGranted = await this.requestPermission();
				if (!permissionGranted) return null;
			}

			// Get token
			const currentToken = await getToken(this.messaging, {
				vapidKey,
				serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
			});

			if (currentToken) {
				this.token = currentToken;

				// Send token to server if not already sent
				if (!this.isTokenSentToServer) {
					await this.sendTokenToServer(userId, currentToken);
					this.isTokenSentToServer = true;
				}

				return currentToken;
			} else {
				console.info('No registration token available');
				this.token = null;
				this.isTokenSentToServer = false;

				return null;
			}
		} catch (error) {
			console.error('Error getting FCM token:', error);

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
			// Store token in pushNotifications collection
			await setDoc(doc(db, 'pushNotifications', token), {
				token,
				userId,
				lastUpdate: new Date(),
				platform: 'web',
				deviceInfo: {
					userAgent: navigator.userAgent,
					language: navigator.language
				}
			}, { merge: true });

			console.info('FCM token sent to server in pushNotifications collection');
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
			console.info('This browser does not support the required features for notifications');

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

			// Store in askedToBeNotify collection

			const notificationRef = doc(DB, Collections.askedToBeNotified, `${token}_${statementId}`);
			await setDoc(notificationRef, {
				token,
				userId,
				statementId,
				lastUpdate: new Date()
			}, { merge: true });

			console.info(`Registered for notifications for statement ${statementId}`);

			return true;
		} catch (error) {
			console.error('Error registering for statement notifications:', error);

			return false;
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
			console.info('Message received in foreground:', payload);

			// If we have a notification payload, show it
			if (payload.notification) {
				this.showForegroundNotification(payload);
			}

			// Call any registered handler
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
}

// Export a singleton instance
export const notificationService = NotificationService.getInstance();
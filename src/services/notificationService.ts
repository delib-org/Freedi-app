import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "@/controllers/db/config";
import { vapidKey } from "@/controllers/db/configKey";
import { setDoc, doc, getFirestore } from "firebase/firestore";

// Initialize Firebase Messaging
const messaging = getMessaging(app);
const db = getFirestore(app);

/**
 * Service for handling push notifications using Firebase Cloud Messaging
 */
export class NotificationService {
  private static instance: NotificationService;
  private token: string | null = null;
  private isTokenSentToServer = false;
  private notificationHandler: ((payload: any) => void) | null = null;

  private constructor() {
    // Singleton pattern
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
   * Request permission to show notifications
   * @returns A promise that resolves with a boolean indicating if permission was granted
   */
  public async requestPermission(): Promise<boolean> {
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
    try {
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
    try {
      // Request permission first if not granted
      if (Notification.permission !== 'granted') {
        const permissionGranted = await this.requestPermission();
        if (!permissionGranted) return null;
      }

      // Get token
      const currentToken = await getToken(messaging, {
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
      // Store token in Firestore
      await setDoc(doc(db, 'fcmTokens', userId), {
        token,
        userId,
        createdAt: new Date(),
        platform: 'web',
        deviceInfo: {
          userAgent: navigator.userAgent,
          language: navigator.language
        }
      }, { merge: true });
      
      console.info('FCM token sent to server');
    } catch (error) {
      console.error('Error sending token to server:', error);
      this.isTokenSentToServer = false;
    }
  }

  /**
   * Set up a listener for foreground messages
   */
  private setupForegroundListener(): void {
    onMessage(messaging, (payload) => {
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
  private showForegroundNotification(payload: any): void {
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
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
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
  public setNotificationHandler(handler: (payload: any) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * Check if the user has granted notification permission
   * @returns True if notification permission is granted
   */
  public hasPermission(): boolean {
    return Notification.permission === 'granted';
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
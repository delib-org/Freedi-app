/**
 * Tests for NotificationService
 */

// Mock platform service
jest.mock('../platformService', () => ({
	PlatformService: {
		getPlatformName: jest.fn(() => 'web'),
		isServiceWorkerSupported: jest.fn(() => true),
	},
	isBrowserNotificationsSupported: jest.fn(() => true),
}));

// Mock push service - define inline to avoid hoisting issues
jest.mock('../pushService', () => ({
	PushService: {
		safeGetPermission: jest.fn(() => 'granted'),
		requestPermission: jest.fn(() => Promise.resolve(true)),
		hasPermission: jest.fn(() => true),
		isInitialized: jest.fn(() => true),
		getTokenRefreshInterval: jest.fn(() => 24 * 60 * 60 * 1000),
	},
	waitForServiceWorker: jest.fn(() => Promise.resolve()),
	initializeMessaging: jest.fn(() => Promise.resolve(true)),
	getOrRefreshToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
	setupForegroundListener: jest.fn(() => Promise.resolve()),
	deleteCurrentToken: jest.fn(() => Promise.resolve()),
	setNotificationHandler: jest.fn(),
}));

import { NotificationService } from '../notificationService';

// Mock notification repository
jest.mock('../notificationRepository', () => ({
	storeToken: jest.fn(() => Promise.resolve()),
	deleteToken: jest.fn(() => Promise.resolve()),
	getTokenLastRefresh: jest.fn(() => Promise.resolve(new Date())),
	registerForStatementNotifications: jest.fn(() => Promise.resolve()),
	unregisterFromStatementNotifications: jest.fn(() => Promise.resolve()),
	syncTokenWithSubscriptions: jest.fn(() => Promise.resolve()),
	removeTokenFromAllSubscriptions: jest.fn(() => Promise.resolve()),
}));

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
	doc: jest.fn(),
	getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
}));

// Mock DB
jest.mock('@/controllers/db/config', () => ({
	DB: {},
}));

describe('NotificationService', () => {
	let service: NotificationService;

	beforeEach(() => {
		jest.clearAllMocks();
		// Reset the singleton for each test
		// @ts-expect-error - Accessing private static member for testing
		NotificationService.instance = undefined;
		service = NotificationService.getInstance();
	});

	describe('getInstance()', () => {
		it('should return singleton instance', () => {
			const instance1 = NotificationService.getInstance();
			const instance2 = NotificationService.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should return NotificationService instance', () => {
			const instance = NotificationService.getInstance();
			expect(instance).toBeInstanceOf(NotificationService);
		});
	});

	describe('isSupported()', () => {
		it('should return true when browser notifications are supported', () => {
			const { isBrowserNotificationsSupported } = require('../platformService');
			isBrowserNotificationsSupported.mockReturnValue(true);

			expect(service.isSupported()).toBe(true);
		});

		it('should return false when browser notifications are not supported', () => {
			const { isBrowserNotificationsSupported } = require('../platformService');
			isBrowserNotificationsSupported.mockReturnValue(false);

			expect(service.isSupported()).toBe(false);
		});
	});

	describe('safeGetPermission()', () => {
		it('should return permission status', () => {
			const { PushService } = require('../pushService');
			PushService.safeGetPermission.mockReturnValue('granted');

			expect(service.safeGetPermission()).toBe('granted');
		});

		it('should return unsupported when not available', () => {
			const { PushService } = require('../pushService');
			PushService.safeGetPermission.mockReturnValue('unsupported');

			expect(service.safeGetPermission()).toBe('unsupported');
		});

		it('should return denied when permission denied', () => {
			const { PushService } = require('../pushService');
			PushService.safeGetPermission.mockReturnValue('denied');

			expect(service.safeGetPermission()).toBe('denied');
		});
	});

	describe('requestPermission()', () => {
		it('should return true when permission granted', async () => {
			const { PushService } = require('../pushService');
			PushService.requestPermission.mockResolvedValue(true);

			const result = await service.requestPermission();

			expect(result).toBe(true);
		});

		it('should return false when permission denied', async () => {
			const { PushService } = require('../pushService');
			PushService.requestPermission.mockResolvedValue(false);

			const result = await service.requestPermission();

			expect(result).toBe(false);
		});
	});

	describe('hasPermission()', () => {
		it('should return true when permission is granted', () => {
			const { PushService } = require('../pushService');
			PushService.hasPermission.mockReturnValue(true);

			expect(service.hasPermission()).toBe(true);
		});

		it('should return false when permission is not granted', () => {
			const { PushService } = require('../pushService');
			PushService.hasPermission.mockReturnValue(false);

			expect(service.hasPermission()).toBe(false);
		});
	});

	describe('getToken()', () => {
		it('should return null initially', () => {
			expect(service.getToken()).toBeNull();
		});
	});

	describe('getCurrentUserId()', () => {
		it('should return null initially', () => {
			expect(service.getCurrentUserId()).toBeNull();
		});
	});

	describe('isInitialized()', () => {
		it('should return false when no token', () => {
			const { PushService } = require('../pushService');
			PushService.isInitialized.mockReturnValue(true);
			// Token is null by default
			expect(service.isInitialized()).toBe(false);
		});
	});

	describe('initialize()', () => {
		const { isBrowserNotificationsSupported } = require('../platformService');

		it('should return early if not supported', async () => {
			isBrowserNotificationsSupported.mockReturnValue(false);

			await service.initialize('user-123');

			const { waitForServiceWorker } = require('../pushService');
			expect(waitForServiceWorker).not.toHaveBeenCalled();
		});

		it('should set up token refresh on successful initialization', async () => {
			isBrowserNotificationsSupported.mockReturnValue(true);
			const { PushService, initializeMessaging, getOrRefreshToken } = require('../pushService');
			PushService.requestPermission.mockResolvedValue(true);
			initializeMessaging.mockResolvedValue(true);
			getOrRefreshToken.mockResolvedValue('mock-token');

			await service.initialize('user-123');

			expect(service.getCurrentUserId()).toBe('user-123');
		});

		it('should handle initialization failure gracefully', async () => {
			isBrowserNotificationsSupported.mockReturnValue(true);

			const { initializeMessaging } = require('../pushService');
			initializeMessaging.mockResolvedValue(false);

			// Should not throw
			await expect(service.initialize('user-123')).resolves.toBeUndefined();
		});

		it('should return early if permission denied', async () => {
			isBrowserNotificationsSupported.mockReturnValue(true);
			const { PushService, initializeMessaging, setupForegroundListener } = require('../pushService');
			PushService.requestPermission.mockResolvedValue(false);
			initializeMessaging.mockResolvedValue(true);

			await service.initialize('user-123');

			expect(setupForegroundListener).not.toHaveBeenCalled();
		});
	});

	describe('registerForStatementNotifications()', () => {
		const { isBrowserNotificationsSupported } = require('../platformService');

		it('should return false if not supported', async () => {
			isBrowserNotificationsSupported.mockReturnValue(false);

			const result = await service.registerForStatementNotifications(
				'user-123',
				'token-123',
				'statement-123'
			);

			expect(result).toBe(false);
		});

		it('should register with provided token', async () => {
			isBrowserNotificationsSupported.mockReturnValue(true);

			const { registerForStatementNotifications } = require('../notificationRepository');

			const result = await service.registerForStatementNotifications(
				'user-123',
				'token-123',
				'statement-123'
			);

			expect(result).toBe(true);
			expect(registerForStatementNotifications).toHaveBeenCalledWith(
				'user-123',
				'token-123',
				'statement-123'
			);
		});

		it('should handle registration errors', async () => {
			isBrowserNotificationsSupported.mockReturnValue(true);

			const { registerForStatementNotifications } = require('../notificationRepository');
			registerForStatementNotifications.mockRejectedValue(new Error('Registration failed'));

			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			const result = await service.registerForStatementNotifications(
				'user-123',
				'token-123',
				'statement-123'
			);

			expect(result).toBe(false);
			consoleErrorSpy.mockRestore();
		});
	});

	describe('unregisterFromStatementNotifications()', () => {
		it('should return false if no token or user', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			const result = await service.unregisterFromStatementNotifications('statement-123');

			expect(result).toBe(false);
			consoleErrorSpy.mockRestore();
		});
	});

	describe('cleanup()', () => {
		it('should reset service state', async () => {
			// Initialize first
			const { isBrowserNotificationsSupported } = require('../platformService');
			const { PushService, initializeMessaging, getOrRefreshToken } = require('../pushService');

			isBrowserNotificationsSupported.mockReturnValue(true);
			PushService.requestPermission.mockResolvedValue(true);
			initializeMessaging.mockResolvedValue(true);
			getOrRefreshToken.mockResolvedValue('mock-token');

			await service.initialize('user-123');

			// Then cleanup
			await service.cleanup();

			expect(service.getToken()).toBeNull();
			expect(service.getCurrentUserId()).toBeNull();
		});

		it('should delete current token', async () => {
			const { deleteCurrentToken } = require('../pushService');

			await service.cleanup();

			expect(deleteCurrentToken).toHaveBeenCalled();
		});

		it('should handle cleanup errors gracefully', async () => {
			const { deleteCurrentToken } = require('../pushService');
			deleteCurrentToken.mockRejectedValue(new Error('Delete failed'));

			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			// Should not throw
			await expect(service.cleanup()).resolves.toBeUndefined();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('setNotificationHandler()', () => {
		it('should set notification handler', () => {
			const { setNotificationHandler } = require('../pushService');
			const handler = jest.fn();

			service.setNotificationHandler(handler);

			expect(setNotificationHandler).toHaveBeenCalledWith(handler);
		});
	});

	describe('syncTokenWithSubscriptions()', () => {
		it('should log error if no token', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			await service.syncTokenWithSubscriptions('user-123');

			expect(consoleErrorSpy).toHaveBeenCalledWith('No token available to sync');
			consoleErrorSpy.mockRestore();
		});
	});

	describe('removeTokenFromAllSubscriptions()', () => {
		it('should call repository function', async () => {
			const { removeTokenFromAllSubscriptions } = require('../notificationRepository');

			await service.removeTokenFromAllSubscriptions('user-123', 'token-123');

			expect(removeTokenFromAllSubscriptions).toHaveBeenCalledWith('user-123', 'token-123');
		});

		it('should handle errors gracefully', async () => {
			const { removeTokenFromAllSubscriptions } = require('../notificationRepository');
			removeTokenFromAllSubscriptions.mockRejectedValue(new Error('Remove failed'));

			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			// Should not throw
			await expect(
				service.removeTokenFromAllSubscriptions('user-123', 'token-123')
			).resolves.toBeUndefined();

			consoleErrorSpy.mockRestore();
		});

		it('should not log Null value errors', async () => {
			const { removeTokenFromAllSubscriptions } = require('../notificationRepository');
			removeTokenFromAllSubscriptions.mockRejectedValue(new Error('Null value error'));

			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			await service.removeTokenFromAllSubscriptions('user-123', 'token-123');

			expect(consoleErrorSpy).not.toHaveBeenCalled();
			consoleErrorSpy.mockRestore();
		});
	});

	describe('getDiagnostics()', () => {
		it('should return diagnostic information', async () => {
			const { PlatformService, isBrowserNotificationsSupported } = require('../platformService');
			const { PushService } = require('../pushService');
			isBrowserNotificationsSupported.mockReturnValue(true);
			PushService.safeGetPermission.mockReturnValue('granted');
			PushService.isInitialized.mockReturnValue(false);
			PlatformService.getPlatformName.mockReturnValue('web');
			PlatformService.isServiceWorkerSupported.mockReturnValue(false);

			const diagnostics = await service.getDiagnostics();

			expect(diagnostics).toMatchObject({
				supported: true,
				permission: 'granted',
				hasToken: false,
				token: null,
				userId: null,
				isInitialized: false,
				platform: 'web',
			});
		});

		it('should check service worker when supported', async () => {
			const { PlatformService, isBrowserNotificationsSupported } = require('../platformService');
			isBrowserNotificationsSupported.mockReturnValue(true);
			PlatformService.isServiceWorkerSupported.mockReturnValue(true);

			// Mock navigator.serviceWorker
			const mockRegistration = { active: true };
			Object.defineProperty(navigator, 'serviceWorker', {
				value: {
					getRegistration: jest.fn(() => Promise.resolve(mockRegistration)),
				},
				writable: true,
				configurable: true,
			});

			const diagnostics = await service.getDiagnostics();

			expect(diagnostics.serviceWorkerReady).toBe(true);
		});
	});
});

/**
 * FCM token retrieval, and specifically its recovery from a poisoned
 * IndexedDB.
 *
 * A browser that ends up with an FCM database at a newer schema version than
 * the SDK expects can never open it again: `open(name, 1)` against a version-2
 * database throws VersionError every single time. Push then stays broken for
 * that user across reloads and redeploys, which is exactly what Sentry saw.
 * These tests pin the one-shot repair that gets them out of it.
 */

const mockGetToken = jest.fn();
const mockDeleteToken = jest.fn();

jest.mock('firebase/messaging', () => ({
	getMessaging: jest.fn(() => ({})),
	getToken: (...args: unknown[]) => mockGetToken(...args),
	deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
	onMessage: jest.fn(),
}));

jest.mock('@/controllers/db/config', () => ({ app: {} }));
jest.mock('@/controllers/db/configKey', () => ({ vapidKey: 'v'.repeat(88) }));

jest.mock('../platformService', () => ({
	isFirebaseMessagingSupported: jest.fn(() => true),
	isBrowserNotificationsSupported: jest.fn(() => true),
}));

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import { getOrRefreshToken } from '../pushService';
import { logError } from '@/utils/errorHandling';

/** The exact DOMException the browser raises for a downgrade-shaped open. */
function versionError(): DOMException {
	return new DOMException(
		'The requested version (1) is less than the existing version (2).',
		'VersionError',
	);
}

const deletedDatabases: string[] = [];

beforeAll(() => {
	Object.defineProperty(window, 'Notification', {
		configurable: true,
		writable: true,
		value: { permission: 'granted', requestPermission: jest.fn() },
	});

	const registration = { active: { scriptURL: '/firebase-messaging-sw.js' } };
	Object.defineProperty(navigator, 'serviceWorker', {
		configurable: true,
		writable: true,
		value: {
			getRegistrations: jest.fn(async () => [registration]),
			getRegistration: jest.fn(async () => registration),
			ready: Promise.resolve(registration),
		},
	});

	Object.defineProperty(window, 'indexedDB', {
		configurable: true,
		writable: true,
		value: {
			deleteDatabase: (name: string) => {
				deletedDatabases.push(name);
				const request: Record<string, unknown> = {};
				// The browser fires this asynchronously; mirror that so the code
				// under test really has to wait for it.
				setTimeout(() => (request.onsuccess as () => void)?.(), 0);

				return request;
			},
		},
	});
});

beforeEach(() => {
	jest.clearAllMocks();
	deletedDatabases.length = 0;
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('getOrRefreshToken', () => {
	it('returns the token when nothing is wrong', async () => {
		mockGetToken.mockResolvedValue('fcm-token-1');

		await expect(getOrRefreshToken()).resolves.toBe('fcm-token-1');
		expect(deletedDatabases).toEqual([]);
		expect(logError).not.toHaveBeenCalled();
	});

	it('clears the FCM databases and retries after a VersionError', async () => {
		mockGetToken.mockRejectedValueOnce(versionError()).mockResolvedValueOnce('fcm-token-2');

		await expect(getOrRefreshToken()).resolves.toBe('fcm-token-2');
		expect(deletedDatabases).toEqual(
			expect.arrayContaining(['firebase-messaging-database', 'firebase-installations-database']),
		);
		// A repair that worked is not an incident.
		expect(logError).not.toHaveBeenCalled();
	});

	it('reports a version conflict that survives the repair', async () => {
		mockGetToken.mockRejectedValue(versionError());

		await expect(getOrRefreshToken()).resolves.toBeNull();
		expect(logError).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				metadata: expect.objectContaining({ versionConflictSurvivedRepair: true }),
			}),
		);
	});

	it('does not clear databases for an unrelated failure', async () => {
		mockGetToken.mockRejectedValue(new Error('messaging/token-subscribe-failed'));

		await expect(getOrRefreshToken()).resolves.toBeNull();
		expect(deletedDatabases).toEqual([]);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				metadata: expect.objectContaining({ versionConflictSurvivedRepair: false }),
			}),
		);
	});
});

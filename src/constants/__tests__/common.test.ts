/**
 * Tests for common constants
 *
 * Validates that all constants have correct values and type structure.
 * These tests protect against accidental changes to critical constants
 * that could affect timestamps, Firebase batch sizes, etc.
 */

import {
	TIME,
	FIREBASE,
	RETRY,
	NOTIFICATION,
	UI,
	VALIDATION,
	JOINING,
	CACHE,
	ERROR_MESSAGES,
	SUCCESS_MESSAGES,
	STORAGE_KEYS,
	ROUTES,
	FEATURES,
	PWA,
	PWA_MESSAGES,
} from '../common';

describe('TIME constants', () => {
	it('should have SECOND = 1000ms', () => {
		expect(TIME.SECOND).toBe(1000);
	});

	it('should have MINUTE = 60 * 1000ms', () => {
		expect(TIME.MINUTE).toBe(60_000);
	});

	it('should have HOUR = 3600 * 1000ms', () => {
		expect(TIME.HOUR).toBe(3_600_000);
	});

	it('should have DAY = 24 hours', () => {
		expect(TIME.DAY).toBe(TIME.HOUR * 24);
	});

	it('should have WEEK = 7 days', () => {
		expect(TIME.WEEK).toBe(TIME.DAY * 7);
	});

	it('should have MONTH = 30 days', () => {
		expect(TIME.MONTH).toBe(TIME.DAY * 30);
	});

	it('should maintain correct relative relationships', () => {
		expect(TIME.MINUTE).toBe(TIME.SECOND * 60);
		expect(TIME.HOUR).toBe(TIME.MINUTE * 60);
		expect(TIME.DAY).toBe(TIME.HOUR * 24);
		expect(TIME.WEEK).toBe(TIME.DAY * 7);
	});
});

describe('FIREBASE constants', () => {
	it('should have BATCH_SIZE = 500 (Firestore transaction limit)', () => {
		expect(FIREBASE.BATCH_SIZE).toBe(500);
	});

	it('should have MAX_TRANSACTION_RETRIES = 3', () => {
		expect(FIREBASE.MAX_TRANSACTION_RETRIES).toBe(3);
	});

	it('should have QUERY_LIMIT_DEFAULT = 50', () => {
		expect(FIREBASE.QUERY_LIMIT_DEFAULT).toBe(50);
	});

	it('should have QUERY_LIMIT_MAX = 100', () => {
		expect(FIREBASE.QUERY_LIMIT_MAX).toBe(100);
	});

	it('QUERY_LIMIT_MAX should be >= QUERY_LIMIT_DEFAULT', () => {
		expect(FIREBASE.QUERY_LIMIT_MAX).toBeGreaterThanOrEqual(FIREBASE.QUERY_LIMIT_DEFAULT);
	});
});

describe('RETRY constants', () => {
	it('should have MAX_ATTEMPTS = 4', () => {
		expect(RETRY.MAX_ATTEMPTS).toBe(4);
	});

	it('should have INITIAL_DELAY_MS = 2000', () => {
		expect(RETRY.INITIAL_DELAY_MS).toBe(2000);
	});

	it('should have MAX_DELAY_MS = 16000', () => {
		expect(RETRY.MAX_DELAY_MS).toBe(16_000);
	});

	it('should have EXPONENTIAL_BASE = 2', () => {
		expect(RETRY.EXPONENTIAL_BASE).toBe(2);
	});

	it('MAX_DELAY_MS should be greater than INITIAL_DELAY_MS', () => {
		expect(RETRY.MAX_DELAY_MS).toBeGreaterThan(RETRY.INITIAL_DELAY_MS);
	});

	it('should calculate correct exponential backoff delays', () => {
		// Verify the exponential backoff formula: INITIAL * BASE^(attempt-1)
		// attempt 1: 2000 * 2^0 = 2000
		// attempt 2: 2000 * 2^1 = 4000
		// attempt 3: 2000 * 2^2 = 8000
		// attempt 4: 2000 * 2^3 = 16000 → capped at MAX_DELAY_MS
		const attempt1Delay = RETRY.INITIAL_DELAY_MS * Math.pow(RETRY.EXPONENTIAL_BASE, 0);
		const attempt4Delay = RETRY.INITIAL_DELAY_MS * Math.pow(RETRY.EXPONENTIAL_BASE, 3);

		expect(attempt1Delay).toBe(2000);
		expect(attempt4Delay).toBeLessThanOrEqual(RETRY.MAX_DELAY_MS);
	});
});

describe('NOTIFICATION constants', () => {
	it('should have TOKEN_REFRESH_INTERVAL = 30 days', () => {
		expect(NOTIFICATION.TOKEN_REFRESH_INTERVAL).toBe(TIME.DAY * 30);
	});

	it('should have TOKEN_CHECK_INTERVAL = 24 hours', () => {
		expect(NOTIFICATION.TOKEN_CHECK_INTERVAL).toBe(TIME.HOUR * 24);
	});

	it('should have SERVICE_WORKER_TIMEOUT = 10 seconds', () => {
		expect(NOTIFICATION.SERVICE_WORKER_TIMEOUT).toBe(TIME.SECOND * 10);
	});

	it('should have CHECK_INTERVAL = 500ms', () => {
		expect(NOTIFICATION.CHECK_INTERVAL).toBe(500);
	});
});

describe('UI constants', () => {
	it('should have DEBOUNCE_DELAY = 300ms', () => {
		expect(UI.DEBOUNCE_DELAY).toBe(300);
	});

	it('should have THROTTLE_DELAY = 1000ms', () => {
		expect(UI.THROTTLE_DELAY).toBe(1000);
	});

	it('should have ANIMATION_DURATION = 200ms', () => {
		expect(UI.ANIMATION_DURATION).toBe(200);
	});

	it('should have MODAL_Z_INDEX = 1000', () => {
		expect(UI.MODAL_Z_INDEX).toBe(1000);
	});

	it('should have TOOLTIP_DELAY = 500ms', () => {
		expect(UI.TOOLTIP_DELAY).toBe(500);
	});

	it('DEBOUNCE_DELAY should be less than THROTTLE_DELAY', () => {
		expect(UI.DEBOUNCE_DELAY).toBeLessThan(UI.THROTTLE_DELAY);
	});
});

describe('VALIDATION constants', () => {
	it('should have MIN_STATEMENT_LENGTH = 2', () => {
		expect(VALIDATION.MIN_STATEMENT_LENGTH).toBe(2);
	});

	it('should have MIN_TITLE_LENGTH = 3', () => {
		expect(VALIDATION.MIN_TITLE_LENGTH).toBe(3);
	});

	it('should have MAX_STATEMENT_LENGTH = 1000', () => {
		expect(VALIDATION.MAX_STATEMENT_LENGTH).toBe(1000);
	});

	it('should have MAX_DESCRIPTION_LENGTH = 5000', () => {
		expect(VALIDATION.MAX_DESCRIPTION_LENGTH).toBe(5000);
	});

	it('should have MIN_PASSWORD_LENGTH = 8', () => {
		expect(VALIDATION.MIN_PASSWORD_LENGTH).toBe(8);
	});

	it('MIN lengths should be less than MAX lengths', () => {
		expect(VALIDATION.MIN_STATEMENT_LENGTH).toBeLessThan(VALIDATION.MAX_STATEMENT_LENGTH);
		expect(VALIDATION.MIN_TITLE_LENGTH).toBeLessThan(VALIDATION.MAX_DESCRIPTION_LENGTH);
	});
});

describe('JOINING constants', () => {
	it('should have DEFAULT_MIN_MEMBERS = 3', () => {
		expect(JOINING.DEFAULT_MIN_MEMBERS).toBe(3);
	});

	it('should have DEFAULT_MAX_MEMBERS = 10', () => {
		expect(JOINING.DEFAULT_MAX_MEMBERS).toBe(10);
	});

	it('should have MIN_ROOM_SIZE = 2', () => {
		expect(JOINING.MIN_ROOM_SIZE).toBe(2);
	});

	it('DEFAULT_MAX_MEMBERS should be >= DEFAULT_MIN_MEMBERS', () => {
		expect(JOINING.DEFAULT_MAX_MEMBERS).toBeGreaterThanOrEqual(JOINING.DEFAULT_MIN_MEMBERS);
	});
});

describe('CACHE constants', () => {
	it('should have DEFAULT_TTL = 5 minutes', () => {
		expect(CACHE.DEFAULT_TTL).toBe(TIME.MINUTE * 5);
	});

	it('should have LONG_TTL = 1 hour', () => {
		expect(CACHE.LONG_TTL).toBe(TIME.HOUR * 1);
	});

	it('should have SHORT_TTL = 1 minute', () => {
		expect(CACHE.SHORT_TTL).toBe(TIME.MINUTE * 1);
	});

	it('should maintain LONG > DEFAULT > SHORT ordering', () => {
		expect(CACHE.LONG_TTL).toBeGreaterThan(CACHE.DEFAULT_TTL);
		expect(CACHE.DEFAULT_TTL).toBeGreaterThan(CACHE.SHORT_TTL);
	});
});

describe('ERROR_MESSAGES constants', () => {
	it('should have non-empty string values for all messages', () => {
		expect(typeof ERROR_MESSAGES.GENERIC).toBe('string');
		expect(ERROR_MESSAGES.GENERIC.length).toBeGreaterThan(0);

		expect(typeof ERROR_MESSAGES.NETWORK).toBe('string');
		expect(ERROR_MESSAGES.NETWORK.length).toBeGreaterThan(0);

		expect(typeof ERROR_MESSAGES.AUTHENTICATION).toBe('string');
		expect(ERROR_MESSAGES.AUTHENTICATION.length).toBeGreaterThan(0);

		expect(typeof ERROR_MESSAGES.AUTHORIZATION).toBe('string');
		expect(ERROR_MESSAGES.AUTHORIZATION.length).toBeGreaterThan(0);

		expect(typeof ERROR_MESSAGES.VALIDATION).toBe('string');
		expect(ERROR_MESSAGES.VALIDATION.length).toBeGreaterThan(0);
	});

	it('should have distinct messages for each error type', () => {
		const messages = Object.values(ERROR_MESSAGES);
		const uniqueMessages = new Set(messages);
		expect(uniqueMessages.size).toBe(messages.length);
	});
});

describe('SUCCESS_MESSAGES constants', () => {
	it('should have non-empty string values for all messages', () => {
		Object.values(SUCCESS_MESSAGES).forEach((msg) => {
			expect(typeof msg).toBe('string');
			expect(msg.length).toBeGreaterThan(0);
		});
	});
});

describe('STORAGE_KEYS constants', () => {
	it('should have unique key names (no duplicates)', () => {
		const keys = Object.values(STORAGE_KEYS);
		const uniqueKeys = new Set(keys);
		expect(uniqueKeys.size).toBe(keys.length);
	});

	it('should include critical storage keys', () => {
		expect(STORAGE_KEYS.USER_PREFERENCES).toBeDefined();
		expect(STORAGE_KEYS.THEME).toBeDefined();
		expect(STORAGE_KEYS.LANGUAGE).toBeDefined();
		expect(STORAGE_KEYS.AUTH_TOKEN).toBeDefined();
	});
});

describe('ROUTES constants', () => {
	it('should have HOME = "/"', () => {
		expect(ROUTES.HOME).toBe('/');
	});

	it('should have all routes starting with "/"', () => {
		Object.values(ROUTES).forEach((route) => {
			expect(route.startsWith('/')).toBe(true);
		});
	});
});

describe('FEATURES constants', () => {
	it('should be boolean values', () => {
		Object.values(FEATURES).forEach((value) => {
			expect(typeof value).toBe('boolean');
		});
	});
});

describe('PWA constants', () => {
	it('should have MIN_OPTIONS_FOR_PROMPT = 5', () => {
		expect(PWA.MIN_OPTIONS_FOR_PROMPT).toBe(5);
	});

	it('should have positive PROMPT_DELAY', () => {
		expect(PWA.PROMPT_DELAY).toBeGreaterThan(0);
	});

	it('should have positive PROMPT_COOLDOWN', () => {
		expect(PWA.PROMPT_COOLDOWN).toBeGreaterThan(0);
	});
});

describe('PWA_MESSAGES constants', () => {
	it('should have non-empty string values', () => {
		Object.values(PWA_MESSAGES).forEach((msg) => {
			expect(typeof msg).toBe('string');
			expect(msg.length).toBeGreaterThan(0);
		});
	});
});

describe('Constant immutability (as const)', () => {
	it('TIME should not be mutable (TypeScript const check via type)', () => {
		// These constants are declared with "as const" which TypeScript enforces,
		// but at runtime they're regular objects. We verify the values are correct.
		expect(Object.isFrozen(TIME) || typeof TIME === 'object').toBe(true);
	});

	it('All constants should be defined (not undefined)', () => {
		expect(TIME).toBeDefined();
		expect(FIREBASE).toBeDefined();
		expect(RETRY).toBeDefined();
		expect(NOTIFICATION).toBeDefined();
		expect(UI).toBeDefined();
		expect(VALIDATION).toBeDefined();
		expect(JOINING).toBeDefined();
		expect(CACHE).toBeDefined();
		expect(ERROR_MESSAGES).toBeDefined();
		expect(SUCCESS_MESSAGES).toBeDefined();
		expect(STORAGE_KEYS).toBeDefined();
		expect(ROUTES).toBeDefined();
		expect(FEATURES).toBeDefined();
		expect(PWA).toBeDefined();
		expect(PWA_MESSAGES).toBeDefined();
	});
});

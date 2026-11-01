import { describe, expect, it } from 'vitest';
import { classifySignInError, getErrorCode, isInAppBrowser } from '../signInError';

describe('classifySignInError', () => {
	it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])(
		'is silent for %s',
		(code) => {
			expect(classifySignInError({ code })).toBe('silent');
		},
	);

	it.each([
		'auth/popup-blocked',
		'auth/web-storage-unsupported',
		'auth/network-request-failed',
		'auth/internal-error',
	])('is a failure for %s', (code) => {
		expect(classifySignInError({ code })).toBe('failed');
	});

	it('is a failure for errors without a code', () => {
		expect(classifySignInError(new Error('boom'))).toBe('failed');
		expect(classifySignInError('boom')).toBe('failed');
		expect(classifySignInError(null)).toBe('failed');
		expect(classifySignInError(undefined)).toBe('failed');
	});
});

describe('getErrorCode', () => {
	it('reads a string code and ignores other shapes', () => {
		expect(getErrorCode({ code: 'auth/x' })).toBe('auth/x');
		expect(getErrorCode({ code: 5 })).toBeUndefined();
		expect(getErrorCode(null)).toBeUndefined();
	});
});

describe('isInAppBrowser', () => {
	it.each([
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0',
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
		'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
		'WhatsApp/2.23 i',
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
	])('detects an in-app browser', (ua) => {
		expect(isInAppBrowser(ua)).toBe(true);
	});

	it.each([
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
		'',
	])('leaves a regular browser alone', (ua) => {
		expect(isInAppBrowser(ua)).toBe(false);
	});
});

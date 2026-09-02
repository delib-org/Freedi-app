import { describe, it, expect } from 'vitest';
import { classifySignInFailure } from '../signInErrors';

describe('classifySignInFailure', () => {
	it('recovers the credential when the teacher already has an account', () => {
		// The production bug: a returning teacher hit this every time, and the
		// old code answered it with a redirect that could never come back.
		expect(classifySignInFailure('auth/credential-already-in-use')).toBe('recover-credential');
		expect(classifySignInFailure('auth/email-already-in-use')).toBe('recover-credential');
	});

	it('says nothing when the teacher closed the popup or pressed twice', () => {
		expect(classifySignInFailure('auth/popup-closed-by-user')).toBe('ignore');
		expect(classifySignInFailure('auth/cancelled-popup-request')).toBe('ignore');
	});

	it('singles out a blocked popup, which only the teacher can lift', () => {
		expect(classifySignInFailure('auth/popup-blocked')).toBe('popup-blocked');
	});

	it('treats anything else as a failure worth showing', () => {
		expect(classifySignInFailure('auth/unauthorized-domain')).toBe('failed');
		expect(classifySignInFailure('auth/network-request-failed')).toBe('failed');
		expect(classifySignInFailure(undefined)).toBe('failed');
	});
});

import { isTransientSwRegistrationError } from '../swErrors';

describe('swErrors', () => {
	describe('isTransientSwRegistrationError', () => {
		it('returns true for Chromium "Rejected" abort errors', () => {
			expect(isTransientSwRegistrationError(new Error('Rejected'))).toBe(true);
		});

		it('returns true for DOMException AbortError regardless of message', () => {
			expect(isTransientSwRegistrationError(new DOMException('Rejected', 'AbortError'))).toBe(true);
			expect(
				isTransientSwRegistrationError(new DOMException('The operation was aborted', 'AbortError')),
			).toBe(true);
		});

		it('returns true for network-related failures', () => {
			expect(
				isTransientSwRegistrationError(
					new TypeError(
						'Failed to register a ServiceWorker: An unknown error occurred when fetching the script.',
					),
				),
			).toBe(true);
			expect(isTransientSwRegistrationError(new TypeError('Failed to fetch'))).toBe(true);
			expect(isTransientSwRegistrationError(new Error('A network error occurred'))).toBe(true);
		});

		it('returns false for genuine errors', () => {
			expect(isTransientSwRegistrationError(new Error('Script evaluation failed'))).toBe(false);
			expect(isTransientSwRegistrationError(new DOMException('Denied', 'SecurityError'))).toBe(
				false,
			);
		});

		it('returns false when message merely contains "Rejected" as a substring', () => {
			expect(isTransientSwRegistrationError(new Error('Promise Rejected unexpectedly'))).toBe(
				false,
			);
		});

		it('returns false for non-Error values', () => {
			expect(isTransientSwRegistrationError('Rejected')).toBe(false);
			expect(isTransientSwRegistrationError(undefined)).toBe(false);
			expect(isTransientSwRegistrationError(null)).toBe(false);
		});
	});
});

import { parseRetryAfterMs } from '../config/openai-chat';

jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('parseRetryAfterMs', () => {
	it('reads retry-after-ms from a plain headers object', () => {
		expect(parseRetryAfterMs({ headers: { 'retry-after-ms': '428' } })).toBe(428);
	});

	it('reads retry-after (seconds) from a plain headers object', () => {
		expect(parseRetryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000);
	});

	it('reads headers exposed as a Headers-like object', () => {
		const headers = new Map([['retry-after-ms', '750']]);
		expect(parseRetryAfterMs({ headers })).toBe(750);
	});

	it('falls back to the "try again in Xms" phrase in the message', () => {
		const message =
			'429 Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000. Please try again in 658ms. Visit https://platform.openai.com/account/rate-limits';
		expect(parseRetryAfterMs({ message })).toBe(658);
	});

	it('parses a seconds-unit hint in the message', () => {
		expect(parseRetryAfterMs({ message: 'Please try again in 1.5s.' })).toBe(1500);
	});

	it('returns null when no hint is present', () => {
		expect(parseRetryAfterMs({ message: 'boom' })).toBeNull();
		expect(parseRetryAfterMs(undefined)).toBeNull();
		expect(parseRetryAfterMs(new Error('500 server error'))).toBeNull();
	});

	it('ignores malformed values', () => {
		expect(parseRetryAfterMs({ headers: { 'retry-after-ms': 'soon' } })).toBeNull();
		expect(parseRetryAfterMs({ headers: { 'retry-after': '-1' } })).toBeNull();
	});
});

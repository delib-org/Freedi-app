import { initFunctionsSentry, isSentryEnabled, flushSentry } from '../sentry';

/**
 * Sentry must stay completely inert without a DSN. Cloud Functions tests and
 * the emulator run with no SENTRY_DSN, and an initialized @sentry/node keeps
 * background timers alive — which would hang Jest's teardown.
 */
describe('functions Sentry', () => {
	const saved = { ...process.env };

	afterEach(() => {
		process.env = { ...saved };
	});

	it('does not initialize when no DSN is set', () => {
		delete process.env.SENTRY_DSN;
		delete process.env.SENTRY_DSN_FUNCTIONS;

		initFunctionsSentry();

		expect(isSentryEnabled()).toBe(false);
	});

	it('does not initialize for a placeholder or malformed DSN', () => {
		process.env.SENTRY_DSN = 'YOUR_SENTRY_DSN_HERE';
		initFunctionsSentry();
		expect(isSentryEnabled()).toBe(false);

		process.env.SENTRY_DSN = 'not-a-url';
		initFunctionsSentry();
		expect(isSentryEnabled()).toBe(false);
	});

	it('flush resolves true when Sentry is inert', async () => {
		await expect(flushSentry(10)).resolves.toBe(true);
	});
});

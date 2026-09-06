import { initFunctionsSentry, isSentryEnabled, flushSentry } from '../sentry';

/**
 * Sentry must stay completely inert without a DSN, and inert in the emulator
 * even with one — functions/.env carries a real DSN for deploys and the
 * emulator loads the same file. An initialized @sentry/node also keeps
 * background timers alive, which would hang Jest's teardown.
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

	it('does not initialize inside the emulator even with a real DSN', () => {
		process.env.FUNCTIONS_EMULATOR = 'true';
		process.env.SENTRY_DSN = 'https://abc123@o1.ingest.sentry.io/2';
		delete process.env.SENTRY_ENABLE_IN_EMULATOR;

		initFunctionsSentry();

		expect(isSentryEnabled()).toBe(false);
	});

	it('flush resolves true when Sentry is inert', async () => {
		await expect(flushSentry(10)).resolves.toBe(true);
	});
});

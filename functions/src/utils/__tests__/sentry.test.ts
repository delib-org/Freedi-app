import { HttpsError } from 'firebase-functions/v2/https';

import {
	initFunctionsSentry,
	isSentryEnabled,
	flushSentry,
	filterClientFaultEvents,
} from '../sentry';

/**
 * Sentry must stay inert without a DSN, and inert on a developer's machine even
 * with one — functions/.env carries a real DSN for deploys and the emulator
 * loads that same file, which is how local runs ended up in the production
 * project. An initialized @sentry/node also keeps background timers alive,
 * which would hang Jest's teardown, so nothing here may actually initialize.
 */
describe('functions Sentry', () => {
	const saved = { ...process.env };
	const REAL_DSN = 'https://abc123@o1.ingest.sentry.io/2';

	/** Look like a deployed Cloud Function, so the DSN checks are what's tested. */
	function pretendDeployed(): void {
		process.env.K_SERVICE = 'someFunction';
		process.env.NODE_ENV = 'production';
		for (const name of [
			'FUNCTIONS_EMULATOR',
			'FIRESTORE_EMULATOR_HOST',
			'FIREBASE_AUTH_EMULATOR_HOST',
			'FIREBASE_DATABASE_EMULATOR_HOST',
			'FIREBASE_STORAGE_EMULATOR_HOST',
			'FIREBASE_EMULATOR_HUB',
			'PUBSUB_EMULATOR_HOST',
		]) {
			delete process.env[name];
		}
	}

	afterEach(() => {
		process.env = { ...saved };
	});

	it('does not initialize when no DSN is set', () => {
		pretendDeployed();
		delete process.env.SENTRY_DSN;
		delete process.env.SENTRY_DSN_FUNCTIONS;

		initFunctionsSentry();

		expect(isSentryEnabled()).toBe(false);
	});

	it('does not initialize for a placeholder or malformed DSN', () => {
		pretendDeployed();
		process.env.SENTRY_DSN = 'YOUR_SENTRY_DSN_HERE';
		initFunctionsSentry();
		expect(isSentryEnabled()).toBe(false);

		process.env.SENTRY_DSN = 'not-a-url';
		initFunctionsSentry();
		expect(isSentryEnabled()).toBe(false);
	});

	it('does not initialize inside the emulator, real DSN and all', () => {
		pretendDeployed();
		process.env.FUNCTIONS_EMULATOR = 'true';
		process.env.SENTRY_DSN = REAL_DSN;

		initFunctionsSentry();

		expect(isSentryEnabled()).toBe(false);
	});

	it('does not initialize when nothing marks this as a deployment', () => {
		pretendDeployed();
		delete process.env.K_SERVICE;
		process.env.SENTRY_DSN = REAL_DSN;

		initFunctionsSentry();

		expect(isSentryEnabled()).toBe(false);
	});

	it('flush resolves true when Sentry is inert', async () => {
		await expect(flushSentry(10)).resolves.toBe(true);
	});

	/**
	 * The Firebase integration captures every error an onCall handler throws.
	 * An HttpsError that blames the caller is the function working as designed
	 * (a curl probe with no token filed an "unauthenticated" issue in prod), so
	 * beforeSend drops those and keeps everything that points at the server.
	 */
	describe('filterClientFaultEvents', () => {
		const event = { event_id: 'e1' };

		it.each([
			'unauthenticated',
			'permission-denied',
			'invalid-argument',
			'not-found',
			'failed-precondition',
			'resource-exhausted',
		] as const)('drops a client-fault HttpsError (%s)', (code) => {
			const err = new HttpsError(code, 'nope');

			expect(filterClientFaultEvents(event, { originalException: err })).toBeNull();
		});

		it.each(['internal', 'unavailable', 'unknown', 'deadline-exceeded'] as const)(
			'keeps a server-side HttpsError (%s)',
			(code) => {
				const err = new HttpsError(code, 'broken');

				expect(filterClientFaultEvents(event, { originalException: err })).toBe(event);
			},
		);

		it('keeps plain errors, strings and missing exceptions', () => {
			expect(filterClientFaultEvents(event, { originalException: new Error('boom') })).toBe(event);
			expect(filterClientFaultEvents(event, { originalException: 'unauthenticated' })).toBe(event);
			expect(filterClientFaultEvents(event, {})).toBe(event);
		});

		it('ignores a non-HttpsError whose code happens to be a string', () => {
			const err = Object.assign(new Error('fs'), { code: 'ENOENT' });

			expect(filterClientFaultEvents(event, { originalException: err })).toBe(event);
		});
	});
});

import { buildSentryOptions, isUsableDsn } from '../sentryOptions';
import type { SentryLikeEvent } from '../sentryFilters';

const DSN = 'https://abc123@o1.ingest.sentry.io/2';

function options(overrides: Partial<Parameters<typeof buildSentryOptions>[0]> = {}) {
	return buildSentryOptions({ dsn: DSN, app: 'agora', ...overrides });
}

function errorEvent(type: string, value: string, filenames: string[] = []): SentryLikeEvent {
	return {
		exception: {
			values: [
				{
					type,
					value,
					stacktrace: { frames: filenames.map((filename) => ({ filename })) },
				},
			],
		},
	};
}

describe('buildSentryOptions', () => {
	it('tags every event with the app name so one project can be split', () => {
		expect(options({ app: 'odyssey' }).initialScope.tags.app).toBe('odyssey');
	});

	it('defaults the environment to production and passes release through', () => {
		const o = options({ release: '1.2.3' });

		expect(o.environment).toBe('production');
		expect(o.release).toBe('1.2.3');
	});

	it('drops the Firestore internal assertion', () => {
		const event = errorEvent(
			'FirebaseError',
			'FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
		);

		expect(options().beforeSend(event)).toBeNull();
	});

	it('drops a null-target dereference inside the configured firebase chunk', () => {
		const event = errorEvent(
			'TypeError',
			"Cannot read properties of null (reading 'target')",
			['/assets/vendor-firebase-a1.js'],
		);

		expect(
			options({ firebaseChunkNames: ['vendor-firebase'] }).beforeSend(event),
		).toBeNull();
		// Same event, no chunk names configured: nothing corroborates it, so keep.
		expect(options().beforeSend(event)).toBe(event);
	});

	it('drops a transient auth network failure', () => {
		expect(
			options().beforeSend({ message: 'x' }, { originalException: { code: 'auth/network-request-failed' } }),
		).toBeNull();
	});

	it('drops a Firestore unavailable error', () => {
		expect(
			options().beforeSend({ message: 'x' }, {
				originalException: { name: 'FirebaseError', code: 'unavailable' },
			}),
		).toBeNull();
	});

	it('drops a cancelled request', () => {
		expect(
			options().beforeSend({ message: 'x' }, {
				originalException: new Error('The operation was cancelled'),
			}),
		).toBeNull();
	});

	it('drops an event carrying neither an exception nor a message', () => {
		expect(options().beforeSend({})).toBeNull();
	});

	it('keeps a real application error', () => {
		const event = errorEvent('TypeError', 'items.map is not a function', [
			'/assets/index-a1.js',
		]);

		expect(options({ firebaseChunkNames: ['vendor-firebase'] }).beforeSend(event)).toBe(event);
	});

	it('ignores the noise list without needing beforeSend', () => {
		expect(options().ignoreErrors).toContain('auth/network-request-failed');
		expect(options().ignoreErrors).toContain('Failed to fetch');
	});
});

describe('isUsableDsn', () => {
	it.each([
		[DSN, true],
		['YOUR_SENTRY_DSN_HERE', false],
		['', false],
		['not-a-url', false],
		[undefined, false],
		[null, false],
	])('%s -> %s', (dsn, expected) => {
		expect(isUsableDsn(dsn as string | undefined)).toBe(expected);
	});
});

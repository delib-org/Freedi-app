import { resolveStatementImageBucket, UNCONFIGURED_BUCKET } from '../statementImageBucket';

describe('resolveStatementImageBucket', () => {
	it('returns the configured storage bucket', () => {
		expect(
			resolveStatementImageBucket(JSON.stringify({ storageBucket: 'my-app.appspot.com' })),
		).toBe('my-app.appspot.com');
	});

	it('falls back when no config exists', () => {
		expect(resolveStatementImageBucket(undefined)).toBe(UNCONFIGURED_BUCKET);
	});

	it('falls back on malformed or bucket-less config', () => {
		expect(resolveStatementImageBucket('not json')).toBe(UNCONFIGURED_BUCKET);
		expect(resolveStatementImageBucket('{}')).toBe(UNCONFIGURED_BUCKET);
	});
});

describe('fn_imageThumbnail import', () => {
	it('does not throw without a configured bucket', () => {
		const saved = process.env.FIREBASE_CONFIG;
		delete process.env.FIREBASE_CONFIG;
		try {
			jest.isolateModules(() => {
				expect(() => jest.requireActual('../fn_imageThumbnail')).not.toThrow();
			});
		} finally {
			if (saved !== undefined) process.env.FIREBASE_CONFIG = saved;
		}
	});
});

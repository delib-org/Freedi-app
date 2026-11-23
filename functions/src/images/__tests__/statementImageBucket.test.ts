import { resolveStatementImageBucket, TEST_PLACEHOLDER_BUCKET } from '../statementImageBucket';

describe('resolveStatementImageBucket', () => {
	it('returns the configured storage bucket', () => {
		expect(
			resolveStatementImageBucket(JSON.stringify({ storageBucket: 'my-app.appspot.com' })),
		).toBe('my-app.appspot.com');
	});

	it('falls back to a placeholder under tests when no config exists', () => {
		expect(resolveStatementImageBucket(undefined, true)).toBe(TEST_PLACEHOLDER_BUCKET);
	});

	it('falls back under tests on malformed or bucket-less config', () => {
		expect(resolveStatementImageBucket('not json', true)).toBe(TEST_PLACEHOLDER_BUCKET);
		expect(resolveStatementImageBucket('{}', true)).toBe(TEST_PLACEHOLDER_BUCKET);
	});
});

describe('outside tests', () => {
	it('throws a clear error when the bucket is missing', () => {
		expect(() => resolveStatementImageBucket(undefined, false)).toThrow('Missing storage bucket');
		expect(() => resolveStatementImageBucket('{}', false)).toThrow('Missing storage bucket');
		expect(() => resolveStatementImageBucket('not json', false)).toThrow('Missing storage bucket');
	});

	it('still returns a configured bucket', () => {
		expect(resolveStatementImageBucket('{"storageBucket":"b.appspot.com"}', false)).toBe(
			'b.appspot.com',
		);
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

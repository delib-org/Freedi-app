import { describe, expect, it } from 'vitest';
import { errorCodeOf, publishErrorKey, publishWaitKey } from '../publishFeedback';

describe('publishWaitKey', () => {
	it('is null when nothing is in the way', () => {
		expect(publishWaitKey({ submitting: false, uploading: false, drawing: false })).toBeNull();
	});

	it('names publishing first, then the picture being drawn, then the upload', () => {
		expect(publishWaitKey({ submitting: true, uploading: true, drawing: true })).toBe(
			'scenlib.pub_working',
		);
		expect(publishWaitKey({ submitting: false, uploading: true, drawing: true })).toBe(
			'scenlib.pub_wait_cover',
		);
		expect(publishWaitKey({ submitting: false, uploading: true, drawing: false })).toBe(
			'scenlib.pub_wait_upload',
		);
	});
});

describe('publishErrorKey', () => {
	it('maps the callable codes to their own message', () => {
		expect(publishErrorKey('functions/permission-denied')).toBe('scenlib.pub_err_denied');
		expect(publishErrorKey('functions/unauthenticated')).toBe('scenlib.pub_err_signin');
		expect(publishErrorKey('functions/unavailable')).toBe('scenlib.pub_err_network');
		expect(publishErrorKey('functions/deadline-exceeded')).toBe('scenlib.pub_err_network');
		expect(publishErrorKey('functions/internal')).toBe('scenlib.pub_err_server');
	});

	it('names a refused listing and a scenario that cannot be published as it is', () => {
		expect(publishErrorKey('functions/invalid-argument')).toBe('scenlib.pub_err_text');
		expect(publishErrorKey('functions/failed-precondition')).toBe('scenlib.pub_err_state');
		expect(publishErrorKey('functions/not-found')).toBe('scenlib.pub_err_missing');
	});

	it('falls back to the check-the-summary message', () => {
		expect(publishErrorKey(undefined)).toBe('scenlib.pub_failed');
		expect(publishErrorKey('functions/something-new')).toBe('scenlib.pub_failed');
	});
});

describe('errorCodeOf', () => {
	it('reads a string code and ignores anything else', () => {
		expect(errorCodeOf({ code: 'functions/internal' })).toBe('functions/internal');
		expect(errorCodeOf(new Error('x'))).toBeUndefined();
		expect(errorCodeOf(null)).toBeUndefined();
		expect(errorCodeOf({ code: 4 })).toBeUndefined();
	});
});

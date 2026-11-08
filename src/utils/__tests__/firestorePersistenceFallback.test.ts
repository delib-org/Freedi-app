import {
	guardUnsubscribe,
	isFirestoreAssertionError,
	shouldSkipIndexedDB,
	clearIndexedDBErrorRecord,
} from '../firestorePersistenceFallback';
import { logError } from '@/utils/errorHandling';

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

const ASSERTION = new Error(
	'FIRESTORE (12.18.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)',
);

describe('firestorePersistenceFallback', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		clearIndexedDBErrorRecord();
	});

	describe('isFirestoreAssertionError', () => {
		it('recognises the SDK assertion', () => {
			expect(isFirestoreAssertionError(ASSERTION)).toBe(true);
			expect(isFirestoreAssertionError(String(ASSERTION.message))).toBe(true);
		});

		it('ignores other errors and empty values', () => {
			expect(isFirestoreAssertionError(new Error('permission-denied'))).toBe(false);
			expect(isFirestoreAssertionError(undefined)).toBe(false);
		});
	});

	describe('guardUnsubscribe', () => {
		it('calls the wrapped unsubscribe', () => {
			const unsubscribe = jest.fn();
			guardUnsubscribe(unsubscribe, 'test.op')();

			expect(unsubscribe).toHaveBeenCalledTimes(1);
			expect(logError).not.toHaveBeenCalled();
		});

		it('swallows an assertion, records the fallback and reports it once', () => {
			const failing = () => {
				throw ASSERTION;
			};

			expect(() => guardUnsubscribe(failing, 'test.op')()).not.toThrow();
			expect(() => guardUnsubscribe(failing, 'test.op')()).not.toThrow();

			expect(shouldSkipIndexedDB()).toBe(true);
			expect(logError).toHaveBeenCalledTimes(1);
		});

		it('swallows and reports any other error without recording the fallback', () => {
			const failing = () => {
				throw new Error('boom');
			};

			expect(() => guardUnsubscribe(failing, 'test.op')()).not.toThrow();
			expect(shouldSkipIndexedDB()).toBe(false);
			expect(logError).toHaveBeenCalledWith(expect.any(Error), {
				operation: 'test.op',
				metadata: { phase: 'unsubscribe', isAssertion: false },
			});
		});
	});
});

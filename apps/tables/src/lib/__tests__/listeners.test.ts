import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentData, DocumentReference, FirestoreError, Query } from 'firebase/firestore';

type ErrorHandler = (error: FirestoreError) => void;

const firestore = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
const utils = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@freedi/shared-utils', () => utils);

import { resilientDoc, resilientQuery } from '../listeners';

const TARGET = {} as Query<DocumentData>;
const DENIED = { code: 'permission-denied' } as FirestoreError;
const UNAVAILABLE = { code: 'unavailable' } as FirestoreError;
const FIRST_RETRY_MS = 1_000;

/** The error handler the listener gave Firestore the last time it subscribed. */
function lastErrorHandler(): ErrorHandler {
	const { calls } = firestore.onSnapshot.mock;

	return calls[calls.length - 1][2] as ErrorHandler;
}

describe('resilientQuery', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		firestore.onSnapshot.mockReset().mockReturnValue(() => undefined);
		utils.logError.mockReset();
	});

	it('logs a refused read and tries again', () => {
		const onError = vi.fn();
		const stop = resilientQuery('test', TARGET, () => undefined, onError);

		lastErrorHandler()(DENIED);
		vi.advanceTimersByTime(FIRST_RETRY_MS);

		expect(onError).toHaveBeenCalledWith(DENIED);
		expect(utils.logError).toHaveBeenCalledTimes(1);
		expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);
		stop();
	});

	it('takes a refusal as the end when the caller expects one: told once, no log, no retry', () => {
		const onError = vi.fn();
		const stop = resilientQuery('test', TARGET, () => undefined, onError, { deniedIsFinal: true });

		lastErrorHandler()(DENIED);
		vi.advanceTimersByTime(FIRST_RETRY_MS);

		expect(onError).toHaveBeenCalledWith(DENIED);
		expect(utils.logError).not.toHaveBeenCalled();
		expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
		stop();
	});

	it('still logs and retries any other failure of such a read', () => {
		const stop = resilientQuery('test', TARGET, () => undefined, undefined, {
			deniedIsFinal: true,
		});

		lastErrorHandler()(UNAVAILABLE);
		vi.advanceTimersByTime(FIRST_RETRY_MS);

		expect(utils.logError).toHaveBeenCalledTimes(1);
		expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);
		stop();
	});

	describe('a first snapshot from the cache', () => {
		type Next = (snap: unknown) => void;

		function lastNext(): Next {
			const { calls } = firestore.onSnapshot.mock;

			return calls[calls.length - 1][1] as Next;
		}

		const emptyFromCache = { metadata: { fromCache: true }, empty: true, docs: [] };
		const emptyFromServer = { metadata: { fromCache: false }, empty: true, docs: [] };
		const missingFromCache = { metadata: { fromCache: true }, exists: () => false };

		it('is not an answer when it is empty: the caller stays loading', () => {
			const onNext = vi.fn();
			const stop = resilientQuery('test', TARGET, onNext);

			lastNext()(emptyFromCache);

			expect(onNext).not.toHaveBeenCalled();
			stop();
		});

		it('is not an answer when the document is missing', () => {
			const onNext = vi.fn();
			const stop = resilientDoc('test', {} as DocumentReference<DocumentData>, onNext);

			lastNext()(missingFromCache);

			expect(onNext).not.toHaveBeenCalled();
			stop();
		});

		it('is passed on once the server confirms the same thing', () => {
			const onNext = vi.fn();
			const stop = resilientQuery('test', TARGET, onNext);

			lastNext()(emptyFromCache);
			lastNext()(emptyFromServer);

			expect(onNext).toHaveBeenCalledTimes(1);
			expect(onNext).toHaveBeenCalledWith(emptyFromServer);
			stop();
		});

		it('is passed on when it has data', () => {
			const onNext = vi.fn();
			const stop = resilientQuery('test', TARGET, onNext);
			const full = { metadata: { fromCache: true }, empty: false, docs: [{}] };

			lastNext()(full);

			expect(onNext).toHaveBeenCalledWith(full);
			stop();
		});

		it('believes an empty one later: after an answer, emptiness is real', () => {
			const onNext = vi.fn();
			const stop = resilientQuery('test', TARGET, onNext);

			lastNext()({ metadata: { fromCache: false }, empty: false, docs: [{}] });
			lastNext()(emptyFromCache);

			expect(onNext).toHaveBeenCalledTimes(2);
			stop();
		});
	});
});

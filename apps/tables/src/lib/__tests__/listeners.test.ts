import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentData, FirestoreError, Query } from 'firebase/firestore';

type ErrorHandler = (error: FirestoreError) => void;

const firestore = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
const utils = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@freedi/shared-utils', () => utils);

import { resilientQuery } from '../listeners';

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
});

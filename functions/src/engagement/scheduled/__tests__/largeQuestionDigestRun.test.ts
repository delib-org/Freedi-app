import type { Firestore } from 'firebase-admin/firestore';

const mockLogError = jest.fn();
jest.mock('../../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

const mockMarkers = jest.fn();
jest.mock('../../../notifications/largeQuestionDigest', () => ({
	processLargeQuestionDigests: (...args: unknown[]) => mockMarkers(...args),
}));

const mockSweep = jest.fn();
const mockDue = jest.fn();
jest.mock('../../../notifications/largeQuestionDigestDelivery', () => ({
	sweepDigestItems: (...args: unknown[]) => mockSweep(...args),
	deliverDueDigestItems: (...args: unknown[]) => mockDue(...args),
}));

import {
	LARGE_QUESTION_DIGEST_TIME_BUDGET_MS,
	LARGE_QUESTION_DIGEST_TIMEOUT_SECONDS,
	runLargeQuestionDigests,
} from '../largeQuestionDigestRun';

const db = {} as Firestore;
const START = 1000;

type HasTime = () => boolean;

describe('runLargeQuestionDigests', () => {
	beforeEach(() => {
		mockMarkers.mockReset().mockResolvedValue({ markers: 0, queued: 0, errors: 0 });
		mockSweep.mockReset().mockResolvedValue({ retried: 0, gaveUp: 0 });
		mockDue.mockReset().mockResolvedValue({ delivered: 0 });
		mockLogError.mockClear();
	});

	it('stops taking work before the function would be cut off', () => {
		expect(LARGE_QUESTION_DIGEST_TIME_BUDGET_MS).toBeLessThan(
			LARGE_QUESTION_DIGEST_TIMEOUT_SECONDS * 1000,
		);
	});

	it('gives both stages the same budget, which runs out on time', async () => {
		let now = START;

		await runLargeQuestionDigests(db, START, () => now);

		const markersHasTime = mockMarkers.mock.calls[0][2] as HasTime;
		const sweepHasTime = mockSweep.mock.calls[0][1] as HasTime;
		now = START + LARGE_QUESTION_DIGEST_TIME_BUDGET_MS - 1;
		expect(markersHasTime()).toBe(true);
		expect(sweepHasTime()).toBe(true);
		now = START + LARGE_QUESTION_DIGEST_TIME_BUDGET_MS;
		expect(markersHasTime()).toBe(false);
		expect(sweepHasTime()).toBe(false);
	});

	it('rescues first and delivers waiting digests last', async () => {
		await runLargeQuestionDigests(db, START);

		const [sweep] = mockSweep.mock.invocationCallOrder;
		const [markers] = mockMarkers.mock.invocationCallOrder;
		const [due] = mockDue.mock.invocationCallOrder;
		expect(sweep).toBeLessThan(markers);
		expect(markers).toBeLessThan(due);
	});

	it('still delivers waiting digests when the marker stage fails', async () => {
		mockMarkers.mockRejectedValue(new Error('index missing'));

		await runLargeQuestionDigests(db, START);

		expect(mockDue).toHaveBeenCalledTimes(1);
		expect(mockLogError).toHaveBeenCalledTimes(1);
	});

	it('does not throw when the sweep fails', async () => {
		mockSweep.mockRejectedValue(new Error('unavailable'));

		await expect(runLargeQuestionDigests(db, START)).resolves.toBeUndefined();
		expect(mockLogError).toHaveBeenCalledTimes(1);
	});
});

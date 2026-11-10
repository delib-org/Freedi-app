import { RATE_VIEW } from '@/constants/common';
import { BatchRequestInput, decideBatchRequest, failureBackoffMs } from '../answerBatchRequests';

const NOW = 1_000_000;
const ASKED = { ratings: 3, answers: 40, at: NOW };

function input(overrides: Partial<BatchRequestInput>): BatchRequestInput {
	return {
		entry: { ids: ['a'], hasMore: true, remaining: 4 },
		unratedShown: 0,
		ratings: 4,
		answerCount: 40,
		lastAsk: ASKED,
		failure: undefined,
		now: NOW,
		...overrides,
	};
}

describe('decideBatchRequest', () => {
	it('asks when the view opens with no batch', () => {
		expect(decideBatchRequest(input({ entry: undefined, lastAsk: null })).kind).toBe('ask');
	});

	it('waits while answers on screen are unrated', () => {
		expect(decideBatchRequest(input({ unratedShown: 1, lastAsk: null })).kind).toBe('wait');
	});

	it('asks for the next batch once this one is rated', () => {
		expect(decideBatchRequest(input({})).kind).toBe('ask');
	});

	it('does not ask twice for the same ratings', () => {
		expect(decideBatchRequest(input({ ratings: ASKED.ratings })).kind).toBe('wait');
	});

	describe('when finished', () => {
		const finished = { ids: ['a'], hasMore: false, remaining: 0 };

		it('asks again when the view reopens', () => {
			expect(decideBatchRequest(input({ entry: finished, lastAsk: null })).kind).toBe('ask');
		});

		it('waits while no answer has been added', () => {
			expect(decideBatchRequest(input({ entry: finished })).kind).toBe('wait');
		});

		it('holds a new answer back until 30 seconds have passed', () => {
			expect(decideBatchRequest(input({ entry: finished, answerCount: 41 }))).toEqual({
				kind: 'ask-later',
				delayMs: RATE_VIEW.FINISHED_REFRESH_MS,
			});
		});

		it('asks once 30 seconds have passed', () => {
			expect(
				decideBatchRequest(
					input({ entry: finished, answerCount: 41, now: NOW + RATE_VIEW.FINISHED_REFRESH_MS }),
				).kind,
			).toBe('ask');
		});
	});

	describe('after a failure', () => {
		it('retries when the view reopens past the backoff', () => {
			expect(
				decideBatchRequest(input({ lastAsk: null, failure: { failures: 1, retryAt: NOW - 1 } }))
					.kind,
			).toBe('ask');
		});

		it('waits inside the backoff', () => {
			expect(
				decideBatchRequest(input({ lastAsk: null, failure: { failures: 1, retryAt: NOW + 1 } }))
					.kind,
			).toBe('wait');
		});

		it('does not retry on its own while the view stays open', () => {
			expect(decideBatchRequest(input({ failure: { failures: 1, retryAt: NOW - 1 } })).kind).toBe(
				'wait',
			);
		});
	});
});

describe('failureBackoffMs', () => {
	it('doubles and stops at the ceiling', () => {
		expect(failureBackoffMs(1)).toBe(RATE_VIEW.FAILURE_RETRY_BASE_MS);
		expect(failureBackoffMs(2)).toBe(RATE_VIEW.FAILURE_RETRY_BASE_MS * 2);
		expect(failureBackoffMs(50)).toBe(RATE_VIEW.FAILURE_RETRY_MAX_MS);
	});
});

import {
	NotificationChannel,
	NotificationQueueStatus,
	type NotificationQueueItem,
} from '@freedi/shared-types';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

const mockRoute = jest.fn();
jest.mock('../../engagement/notifications/channelRouter', () => ({
	routeToChannels: (...args: unknown[]) => mockRoute(...args),
}));

// answerNotifyGate imports the app's Firestore; delivery only needs its pure veto.
jest.mock('../../index', () => ({ db: {} }));

const mockQuietUsers = new Set<string>();
const mockQuietEnd = Date.UTC(2026, 10, 10, 15);
jest.mock('../quietHours', () => ({
	loadQuietHours: async (_db: unknown, userIds: string[]) =>
		new Map(userIds.map((id) => [id, mockQuietUsers.has(id) ? { enabled: true } : null])),
	isInQuietHours: (config: unknown) => Boolean(config),
	quietHoursEndAt: () => mockQuietEnd,
}));

let mockDb: unknown;
jest.mock('firebase-admin/firestore', () => {
	const actual = jest.requireActual('firebase-admin/firestore');

	return { ...actual, getFirestore: () => mockDb };
});

import {
	DIGEST_ITEM_DUE_CONCURRENCY,
	DIGEST_ITEM_DUE_LIMIT,
	DIGEST_ITEM_MAX_AGE_MS,
	DIGEST_ITEM_MAX_RETRIES,
	DIGEST_ITEM_STUCK_MS,
	DIGEST_ITEM_SWEEP_LIMIT,
	LARGE_QUESTION_DIGEST_ITEM_PREFIX,
	deliverDigestItem,
	deliverDueDigestItems,
	isLargeQuestionDigestItem,
	sweepDigestItems,
} from '../largeQuestionDigestDelivery';

import { fakeDb, type Fake } from './largeQuestionDigestDelivery.fakes';

const ID = `${LARGE_QUESTION_DIGEST_ITEM_PREFIX}u1_q1_1`;
const OTHER_ID = 'daily_u1_1';
const NOW = Date.UTC(2026, 10, 10, 7);
const OK = [{ channel: NotificationChannel.PUSH, success: true }];
const BAD = [{ channel: NotificationChannel.PUSH, success: false, error: 'fcm down' }];

function item(overrides: Partial<NotificationQueueItem> & { pushTokens?: string[] } = {}) {
	return {
		queueItemId: ID,
		userId: 'u1',
		status: NotificationQueueStatus.PENDING,
		createdAt: NOW - 2 * DIGEST_ITEM_STUCK_MS,
		channels: [NotificationChannel.PUSH],
		pushTokens: ['t1'],
		...overrides,
	};
}

describe('largeQuestionDigestDelivery', () => {
	let fake: Fake;

	beforeEach(() => {
		fake = fakeDb();
		mockDb = fake.db;
		mockRoute.mockReset();
		mockRoute.mockResolvedValue(OK);
		mockLogError.mockClear();
		mockQuietUsers.clear();
		jest.spyOn(Date, 'now').mockReturnValue(NOW);
	});

	afterEach(() => jest.restoreAllMocks());

	it('recognises only digest items', () => {
		expect(isLargeQuestionDigestItem(ID)).toBe(true);
		expect(isLargeQuestionDigestItem(OTHER_ID)).toBe(false);
		expect(isLargeQuestionDigestItem('largeQuestionDigest_q1_1')).toBe(false);
	});

	describe('deliverDigestItem', () => {
		it('sends a pending digest once, then forgets its tokens', async () => {
			fake.docs.set(ID, item());

			await deliverDigestItem(ID);

			expect(mockRoute).toHaveBeenCalledTimes(1);
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SENT);
			expect(fake.docs.get(ID)?.pushTokens).toBeUndefined();
		});

		it.each([
			NotificationQueueStatus.PROCESSING,
			NotificationQueueStatus.SENT,
			NotificationQueueStatus.FAILED,
		])('does not claim a digest already %s', async (status) => {
			fake.docs.set(ID, item({ status }));

			await deliverDigestItem(ID);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)?.status).toBe(status);
		});

		it('leaves a digest that is still waiting for quiet hours to end', async () => {
			fake.docs.set(ID, item({ deliverAt: NOW + 1 }));

			await deliverDigestItem(ID);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.PENDING);
		});

		it('sends only once when delivered twice', async () => {
			fake.docs.set(ID, item());

			await deliverDigestItem(ID);
			await deliverDigestItem(ID);

			expect(mockRoute).toHaveBeenCalledTimes(1);
		});

		it('records a failure and keeps the tokens for the sweep', async () => {
			mockRoute.mockResolvedValue(BAD);
			fake.docs.set(ID, item());

			await deliverDigestItem(ID);

			expect(fake.docs.get(ID)).toMatchObject({
				status: NotificationQueueStatus.FAILED,
				pushTokens: ['t1'],
				retryCount: 0,
			});
		});

		it('counts a partly delivered digest as sent', async () => {
			mockRoute.mockResolvedValue([...OK, ...BAD]);
			fake.docs.set(ID, item());

			await deliverDigestItem(ID);

			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SENT);
			expect(fake.docs.get(ID)?.error).toContain('Partial');
		});

		it('records a failure when routing throws', async () => {
			mockRoute.mockRejectedValue(new Error('boom'));
			fake.docs.set(ID, item());

			await deliverDigestItem(ID);

			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.FAILED);
			expect(mockLogError).toHaveBeenCalled();
		});
	});

	describe('sweepDigestItems', () => {
		it('actually delivers a failed digest', async () => {
			fake.docs.set(ID, item({ status: NotificationQueueStatus.FAILED, retryCount: 1 }));

			const result = await sweepDigestItems(fake.db);

			expect(result).toEqual({ retried: 1, gaveUp: 0 });
			expect(mockRoute).toHaveBeenCalledTimes(1);
			expect(fake.docs.get(ID)).toMatchObject({
				status: NotificationQueueStatus.SENT,
				retryCount: 2,
			});
		});

		it('delivers a digest stuck in processing for 15 minutes', async () => {
			fake.docs.set(
				ID,
				item({
					status: NotificationQueueStatus.PROCESSING,
					processedAt: NOW - DIGEST_ITEM_STUCK_MS,
				}),
			);

			await sweepDigestItems(fake.db);

			expect(mockRoute).toHaveBeenCalledTimes(1);
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SENT);
		});

		it('leaves a digest that is still being processed', async () => {
			fake.docs.set(
				ID,
				item({
					status: NotificationQueueStatus.PROCESSING,
					processedAt: NOW - DIGEST_ITEM_STUCK_MS + 1,
				}),
			);

			const result = await sweepDigestItems(fake.db);

			expect(result).toEqual({ retried: 0, gaveUp: 0 });
			expect(mockRoute).not.toHaveBeenCalled();
		});

		it('gives up after the retry limit, logs it and stops sweeping that digest', async () => {
			fake.docs.set(
				ID,
				item({ status: NotificationQueueStatus.FAILED, retryCount: DIGEST_ITEM_MAX_RETRIES }),
			);

			const result = await sweepDigestItems(fake.db);

			expect(result).toEqual({ retried: 0, gaveUp: 1 });
			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SKIPPED);
			expect(mockLogError).toHaveBeenCalledTimes(1);
		});

		it('leaves a digest out of the sweep when its last allowed try fails', async () => {
			mockRoute.mockResolvedValue(BAD);
			fake.docs.set(
				ID,
				item({ status: NotificationQueueStatus.FAILED, retryCount: DIGEST_ITEM_MAX_RETRIES - 1 }),
			);

			await sweepDigestItems(fake.db);

			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SKIPPED);
		});

		it('never touches other queue items', async () => {
			fake.docs.set(OTHER_ID, item({ status: NotificationQueueStatus.FAILED }));

			const result = await sweepDigestItems(fake.db);

			expect(result).toEqual({ retried: 0, gaveUp: 0 });
			expect(fake.docs.get(OTHER_ID)?.status).toBe(NotificationQueueStatus.FAILED);
		});

		it('bounds each query', async () => {
			await sweepDigestItems(fake.db);

			expect(fake.limits).toEqual(Array(3).fill(DIGEST_ITEM_SWEEP_LIMIT));
		});

		describe('digests nobody ever claimed', () => {
			it('delivers one left pending for 15 minutes', async () => {
				fake.docs.set(ID, item({ deliverAt: null, createdAt: NOW - DIGEST_ITEM_STUCK_MS }));

				const result = await sweepDigestItems(fake.db);

				expect(result.retried).toBe(1);
				expect(mockRoute).toHaveBeenCalledTimes(1);
				expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SENT);
			});

			it('leaves one created moments ago, which the trigger still has', async () => {
				fake.docs.set(ID, item({ deliverAt: null, createdAt: NOW - DIGEST_ITEM_STUCK_MS + 1 }));

				const result = await sweepDigestItems(fake.db);

				expect(result.retried).toBe(0);
				expect(mockRoute).not.toHaveBeenCalled();
			});

			it('does not treat a digest waiting out quiet hours as lost', async () => {
				fake.docs.set(ID, item({ deliverAt: NOW + 1, createdAt: NOW - 2 * DIGEST_ITEM_STUCK_MS }));

				const result = await sweepDigestItems(fake.db);

				expect(result.retried).toBe(0);
				expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.PENDING);
			});

			it('finds a lost digest even behind a full page of waiting ones', async () => {
				for (let i = 0; i < DIGEST_ITEM_SWEEP_LIMIT; i++) {
					fake.docs.set(`${ID}_waiting_${i}`, item({ deliverAt: NOW + 1 }));
				}
				fake.docs.set(`${ID}_lost`, item({ deliverAt: null }));

				const result = await sweepDigestItems(fake.db);

				expect(result.retried).toBe(1);
				expect(fake.docs.get(`${ID}_lost`)?.status).toBe(NotificationQueueStatus.SENT);
			});
		});

		it('stops when the time budget is spent', async () => {
			fake.docs.set(ID, item({ status: NotificationQueueStatus.FAILED }));

			const result = await sweepDigestItems(fake.db, () => false);

			expect(result.retried).toBe(0);
			expect(mockRoute).not.toHaveBeenCalled();
		});
	});

	describe('deliverDueDigestItems', () => {
		const waiting = (overrides = {}) =>
			item({
				deliverAt: NOW - 1,
				createdAt: NOW - 60 * 60 * 1000,
				channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
				...overrides,
			});

		it('delivers a digest once its quiet hours have ended', async () => {
			fake.docs.set(ID, waiting());

			const result = await deliverDueDigestItems(fake.db, NOW);

			expect(result.delivered).toBe(1);
			expect(mockRoute).toHaveBeenCalledTimes(1);
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SENT);
		});

		it('leaves a digest that is not due yet', async () => {
			fake.docs.set(ID, waiting({ deliverAt: NOW + 1 }));

			const result = await deliverDueDigestItems(fake.db, NOW);

			expect(result.delivered).toBe(0);
			expect(mockRoute).not.toHaveBeenCalled();
		});

		it('waits again if the person is still in quiet hours', async () => {
			mockQuietUsers.add('u1');
			fake.docs.set(ID, waiting());

			await deliverDueDigestItems(fake.db, NOW);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)).toMatchObject({
				status: NotificationQueueStatus.PENDING,
				deliverAt: mockQuietEnd,
				pushTokens: ['t1'],
			});
		});

		it('drops a digest if the person muted everything meanwhile', async () => {
			fake.settings.value = { muted: true };
			fake.docs.set(ID, waiting());

			await deliverDueDigestItems(fake.db, NOW);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)).toMatchObject({
				status: NotificationQueueStatus.SKIPPED,
				deliverAt: null,
			});
			expect(fake.docs.get(ID)?.pushTokens).toBeUndefined();
		});

		it('sends only the channels the person still allows', async () => {
			fake.subscription.value = { getPushNotification: true, getEmailNotification: false };
			fake.docs.set(ID, waiting());

			await deliverDueDigestItems(fake.db, NOW);

			expect(mockRoute.mock.calls[0][0].channels).toEqual([NotificationChannel.PUSH]);
		});

		it.each([
			['the question is gone', (f: Fake) => (f.question.value = null)],
			['the question is hidden', (f: Fake) => (f.question.value = { hide: true })],
			['they unsubscribed', (f: Fake) => (f.subscription.value = null)],
			['they were banned', (f: Fake) => (f.subscription.value = { role: 'banned' })],
			[
				'they turned new answers off',
				(f: Fake) => (f.subscription.value = { notifyOnNewAnswers: false }),
			],
		])('drops a digest when %s', async (_, change) => {
			change(fake);
			fake.docs.set(ID, waiting());

			await deliverDueDigestItems(fake.db, NOW);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SKIPPED);
		});

		it('drops a digest that is more than a day old', async () => {
			fake.docs.set(ID, waiting({ createdAt: NOW - DIGEST_ITEM_MAX_AGE_MS - 1 }));

			await deliverDueDigestItems(fake.db, NOW);

			expect(mockRoute).not.toHaveBeenCalled();
			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.SKIPPED);
		});

		it('records a failed check so the sweep can retry it', async () => {
			fake.docs.set(ID, waiting());
			jest
				.spyOn(fake.db as unknown as { getAll: () => Promise<unknown> }, 'getAll')
				.mockRejectedValue(new Error('unavailable'));

			await deliverDueDigestItems(fake.db, NOW);

			expect(fake.docs.get(ID)?.status).toBe(NotificationQueueStatus.FAILED);
			expect(mockLogError).toHaveBeenCalled();
		});

		it('takes a bounded number per run', async () => {
			await deliverDueDigestItems(fake.db, NOW);

			expect(fake.limits).toEqual([DIGEST_ITEM_DUE_LIMIT]);
		});

		it('carries the rest over when the time budget runs out', async () => {
			const total = DIGEST_ITEM_DUE_CONCURRENCY * 2;
			for (let i = 0; i < total; i++) fake.docs.set(`${ID}_${i}`, waiting());
			let groups = 0;

			const result = await deliverDueDigestItems(fake.db, NOW, () => groups++ < 1);

			expect(result.delivered).toBe(DIGEST_ITEM_DUE_CONCURRENCY);
			const stillDue = [...fake.docs.values()].filter(
				(doc) => doc.status === NotificationQueueStatus.PENDING,
			);
			expect(stillDue).toHaveLength(DIGEST_ITEM_DUE_CONCURRENCY);
		});
	});
});

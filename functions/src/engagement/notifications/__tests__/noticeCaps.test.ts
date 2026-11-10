import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { NotificationQueueItem } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { createFakeDb, FakeDb } from '../../../progress/__tests__/fakeDb';

const mockLogError = jest.fn();
jest.mock('../../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import {
	ANSWER_NOTICE_LIFETIME_LIMIT,
	ANSWER_NOTICE_WINDOW_MS,
	claimAnswerNotice,
	PERSON_LIMIT,
	PERSON_QUESTION_WINDOW_MS,
	PERSON_WINDOW_MS,
} from '../noticeCaps';
import type { NoticeClaimResult } from '../noticeCaps';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** Exactly on a bucket edge for every window, so a test can step across one. */
const T0 = 1000 * ANSWER_NOTICE_WINDOW_MS;
const ALICE = 'alice';
const BOB = 'bob';

function notice(queueItemId: string, userId: string): NotificationQueueItem {
	return {
		queueItemId,
		userId,
		title: 't',
		body: 'b',
		channels: [NotificationChannel.IN_APP],
		sourceApp: SourceApp.MAIN,
		targetPath: '/x',
		deliverAt: null,
		frequency: NotificationFrequency.INSTANT,
		triggerType: NotificationTriggerType.CONSENSUS_SHIFT,
		status: NotificationQueueStatus.PENDING,
		createdAt: 0,
	};
}

describe('claimAnswerNotice', () => {
	let fake: FakeDb;
	let sequence = 0;

	const send = (
		now: number,
		answerId: string,
		questionId: string,
		userId: string = ALICE,
	): Promise<NoticeClaimResult> =>
		claimAnswerNotice({
			db: fake.db as unknown as Firestore,
			notice: notice(`n${++sequence}`, userId),
			now,
			answerId,
			questionId,
			userId,
		});

	const queued = (): number => fake.store.get(Collections.notificationQueue)?.size ?? 0;
	const slots = (): number => fake.store.get(Collections.noticeCapSlots)?.size ?? 0;

	beforeEach(() => {
		fake = createFakeDb();
		sequence = 0;
		mockLogError.mockClear();
	});

	describe('per answer, 1 per 48 hours', () => {
		it('allows the first notice', async () => {
			await expect(send(T0, 'a1', 'q1')).resolves.toBe('queued');
			expect(queued()).toBe(1);
		});

		it('refuses a second notice inside the window', async () => {
			await send(T0, 'a1', 'q1');

			await expect(send(T0 + ANSWER_NOTICE_WINDOW_MS - 1, 'a1', 'q2', BOB)).resolves.toBe('capped');
			expect(queued()).toBe(1);
		});

		it('refuses across a bucket edge while the last notice is younger than the window', async () => {
			const late = T0 + ANSWER_NOTICE_WINDOW_MS - HOUR;
			await send(late, 'a1', 'q1');

			await expect(send(T0 + ANSWER_NOTICE_WINDOW_MS + HOUR, 'a1', 'q2', BOB)).resolves.toBe(
				'capped',
			);
		});

		it('allows the next notice exactly when the window has passed', async () => {
			await send(T0, 'a1', 'q1');

			await expect(send(T0 + ANSWER_NOTICE_WINDOW_MS, 'a1', 'q2', BOB)).resolves.toBe('queued');
		});
	});

	describe('per answer, 3 over its lifetime', () => {
		const sendEveryWindow = async (count: number): Promise<NoticeClaimResult[]> => {
			const results: NoticeClaimResult[] = [];
			for (let i = 0; i < count; i++) {
				results.push(await send(T0 + i * ANSWER_NOTICE_WINDOW_MS, 'a1', `q${i}`, `user${i}`));
			}

			return results;
		};

		it('allows exactly the limit', async () => {
			const results = await sendEveryWindow(ANSWER_NOTICE_LIFETIME_LIMIT);

			expect(results).toEqual(['queued', 'queued', 'queued']);
		});

		it('refuses one past the limit, however much later', async () => {
			const results = await sendEveryWindow(ANSWER_NOTICE_LIFETIME_LIMIT + 1);

			expect(results[ANSWER_NOTICE_LIFETIME_LIMIT]).toBe('capped');
		});
	});

	describe('per person per question, 1 per 24 hours', () => {
		it('refuses a second answer by the same person in the same question', async () => {
			await send(T0, 'a1', 'q1');

			await expect(send(T0 + PERSON_QUESTION_WINDOW_MS - 1, 'a2', 'q1')).resolves.toBe('capped');
		});

		it('allows it once 24 hours have passed', async () => {
			await send(T0, 'a1', 'q1');

			await expect(send(T0 + PERSON_QUESTION_WINDOW_MS, 'a2', 'q1')).resolves.toBe('queued');
		});

		it('does not count another person', async () => {
			await send(T0, 'a1', 'q1');

			await expect(send(T0 + 1, 'a2', 'q1', BOB)).resolves.toBe('queued');
		});
	});

	describe('per person overall, 2 per 24 hours', () => {
		it('allows the limit across questions', async () => {
			await expect(send(T0, 'a1', 'q1')).resolves.toBe('queued');
			await expect(send(T0 + 1, 'a2', 'q2')).resolves.toBe('queued');
			expect(PERSON_LIMIT).toBe(2);
		});

		it('refuses one past the limit', async () => {
			await send(T0, 'a1', 'q1');
			await send(T0 + 1, 'a2', 'q2');

			await expect(send(T0 + 2, 'a3', 'q3')).resolves.toBe('capped');
		});

		it('counts notices from the previous bucket that are still in the window', async () => {
			await send(T0 + DAY - 2 * HOUR, 'a1', 'q1');
			await send(T0 + DAY - HOUR, 'a2', 'q2');

			await expect(send(T0 + DAY + HOUR, 'a3', 'q3')).resolves.toBe('capped');
		});

		it('frees a slot once the oldest notice leaves the window', async () => {
			const first = T0 + DAY - 2 * HOUR;
			await send(first, 'a1', 'q1');
			await send(T0 + DAY - HOUR, 'a2', 'q2');

			await expect(send(first + PERSON_WINDOW_MS, 'a3', 'q3')).resolves.toBe('queued');
		});
	});

	describe('all or nothing', () => {
		it('spends no slot when any cap refuses', async () => {
			await send(T0, 'a1', 'q1');
			const before = slots();

			await expect(send(T0 + 1, 'a2', 'q1')).resolves.toBe('capped');
			expect(slots()).toBe(before);
		});

		it('spends no slot on a notice already queued, and reports it as a duplicate', async () => {
			const db = fake.db as unknown as Firestore;
			const claim = {
				db,
				notice: notice('same-id', ALICE),
				now: T0,
				answerId: 'a1',
				questionId: 'q1',
				userId: ALICE,
			};
			await claimAnswerNotice(claim);
			const before = slots();

			await expect(
				claimAnswerNotice({ ...claim, now: T0 + ANSWER_NOTICE_WINDOW_MS }),
			).resolves.toBe('duplicate');
			expect(slots()).toBe(before);
			expect(queued()).toBe(1);
		});

		it('sends nothing when the re-check refuses', async () => {
			const result = await claimAnswerNotice({
				db: fake.db as unknown as Firestore,
				notice: notice('n', ALICE),
				now: T0,
				answerId: 'a1',
				questionId: 'q1',
				userId: ALICE,
				decide: () => null,
			});

			expect(result).toBe('refused');
			expect(queued()).toBe(0);
			expect(slots()).toBe(0);
		});

		it('records the notice on the answer state', async () => {
			await send(T0, 'a1', 'q1');

			expect(fake.read(Collections.answerNoticeState, 'a1')).toMatchObject({
				statementId: 'a1',
				lastNoticeAt: T0,
				noticesSent: 1,
			});
		});
	});

	describe('fails closed', () => {
		it('sends nothing and logs when the transaction fails', async () => {
			fake.db.runTransaction = jest.fn().mockRejectedValue(new Error('contention'));

			await expect(send(T0, 'a1', 'q1')).resolves.toBe('failed');
			expect(queued()).toBe(0);
			expect(mockLogError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.objectContaining({ operation: 'engagement.claimAnswerNotice', statementId: 'a1' }),
			);
		});

		it('sends nothing when the state doc is malformed', async () => {
			fake.seed(Collections.answerNoticeState, 'a1', { statementId: 'a1', noticesSent: 'lots' });

			await expect(send(T0, 'a1', 'q1')).resolves.toBe('failed');
			expect(queued()).toBe(0);
		});

		it('sends nothing when a slot create collides', async () => {
			const realTransaction = fake.db.runTransaction;
			fake.db.runTransaction = (fn) =>
				realTransaction(async (tx) =>
					fn({
						...tx,
						create: () => {
							throw Object.assign(new Error('Document already exists'), { code: 6 });
						},
					}),
				);

			await expect(send(T0, 'a1', 'q1')).resolves.toBe('failed');
			expect(queued()).toBe(0);
		});
	});
});

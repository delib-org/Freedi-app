import {
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	Role,
	type Statement,
} from '@freedi/shared-types';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

// answerNotifyGate imports the app's Firestore; the digest only needs its pure veto.
jest.mock('../../index', () => ({ db: {} }));

const mockQuietUsers = new Set<string>();
const mockQuietEnd = Date.UTC(2026, 10, 10, 12);
jest.mock('../quietHours', () => ({
	loadQuietHours: async (_db: unknown, userIds: string[]) =>
		new Map(userIds.map((id) => [id, mockQuietUsers.has(id) ? { enabled: true } : null])),
	isInQuietHours: (config: unknown) => Boolean(config),
	quietHoursEndAt: () => mockQuietEnd,
}));

jest.mock('../../engagement/notifications/channelRouter', () => ({ routeToChannels: jest.fn() }));

import {
	LARGE_QUESTION_DIGEST_MAX_RETRIES,
	LARGE_QUESTION_DIGEST_OWNER,
	LARGE_QUESTION_DIGEST_RUN_LIMIT,
	LARGE_QUESTION_SUBSCRIBER_THRESHOLD,
	nextDigestAt,
	processLargeQuestionDigests,
	scheduleLargeQuestionDigest,
	shouldDigestInstead,
} from '../largeQuestionDigest';
import { LARGE_QUESTION_DIGEST_ITEM_PREFIX } from '../largeQuestionDigestDelivery';
import {
	HOUR,
	MORNING,
	QUEUE,
	fakeDb,
	marker,
	sub,
	type FakeDb,
} from './largeQuestionDigest.fakes';

const markerPath = `${QUEUE}/largeQuestionDigest_q1_1`;
const itemPath = (uid: string, deliverAt = MORNING - HOUR) =>
	`${QUEUE}/${LARGE_QUESTION_DIGEST_ITEM_PREFIX}${uid}_q1_${deliverAt}`;
const queued = (fake: FakeDb) =>
	[...fake.docs.entries()].filter(
		([path, doc]) => path !== markerPath && doc.status === NotificationQueueStatus.PENDING,
	);
const queuedUsers = (fake: FakeDb) => queued(fake).map(([, doc]) => doc.userId);

const answer = {
	statementId: 'a1',
	parentId: 'q1',
	creator: { uid: 'first-author' },
} as unknown as Statement;
const question = { statement: 'q'.repeat(500) } as unknown as Statement;

beforeEach(() => {
	mockLogError.mockClear();
	mockQuietUsers.clear();
});

describe('shouldDigestInstead', () => {
	it('stays instant up to and including the threshold', () => {
		expect(shouldDigestInstead(true, LARGE_QUESTION_SUBSCRIBER_THRESHOLD)).toBe(false);
	});

	it('switches to the digest one above the threshold', () => {
		expect(shouldDigestInstead(true, LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1)).toBe(true);
	});

	it('applies to new answers only', () => {
		expect(shouldDigestInstead(false, LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1)).toBe(false);
	});
});

describe('nextDigestAt', () => {
	it('is today when the digest hour is still ahead', () => {
		expect(nextDigestAt(MORNING - HOUR)).toBe(MORNING);
	});

	it('is tomorrow once the digest hour has been reached', () => {
		expect(nextDigestAt(MORNING)).toBe(MORNING + 24 * HOUR);
	});
});

describe('scheduleLargeQuestionDigest', () => {
	const params = {
		statement: answer,
		parentStatement: question,
		sourceApp: undefined,
		targetPath: '/statement/q1?focusId=a1',
	};
	const byAuthor = (uid: string) =>
		({ ...answer, statementId: `by-${uid}`, creator: { uid } }) as unknown as Statement;

	it('opens the question rather than the first answer, and records its author', async () => {
		const fake = fakeDb([]);

		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - HOUR });

		const [stored] = [...fake.docs.values()];
		expect(stored).toMatchObject({
			targetPath: '/statement/q1',
			status: NotificationQueueStatus.SKIPPED,
			deliverAt: MORNING,
			userId: LARGE_QUESTION_DIGEST_OWNER,
			firstAuthorUid: 'first-author',
			multipleAuthors: false,
		});
		expect((stored.body as string).length).toBeLessThan(500);
	});

	it('keeps one marker for many answers in the same period, without an error', async () => {
		const fake = fakeDb([]);

		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - 2 * HOUR });
		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - HOUR });

		expect(fake.docs.size).toBe(1);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('stays single-author when the same person answers again', async () => {
		const fake = fakeDb([]);

		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - 2 * HOUR });
		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - HOUR });

		expect([...fake.docs.values()][0].multipleAuthors).toBe(false);
	});

	it('flags several authors when someone else answers', async () => {
		const fake = fakeDb([]);

		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - 2 * HOUR });
		await scheduleLargeQuestionDigest(fake.db, {
			...params,
			statement: byAuthor('second-author'),
			now: MORNING - HOUR,
		});

		expect([...fake.docs.values()][0].multipleAuthors).toBe(true);
	});

	it('opens a new period after the digest hour', async () => {
		const fake = fakeDb([]);

		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING - HOUR });
		await scheduleLargeQuestionDigest(fake.db, { ...params, now: MORNING + HOUR });

		expect(fake.docs.size).toBe(2);
	});
});

describe('processLargeQuestionDigests', () => {
	it('queues one digest per person and closes the marker', async () => {
		const fake = fakeDb([sub('a'), sub('b')]);
		fake.docs.set(markerPath, marker());

		const result = await processLargeQuestionDigests(fake.db, MORNING);

		expect(result).toEqual({ markers: 1, queued: 2, errors: 0 });
		expect(queuedUsers(fake).sort()).toEqual(['a', 'b']);
		expect(queued(fake)[0][1]).toMatchObject({
			channels: [NotificationChannel.PUSH],
			deliverAt: null,
			targetPath: '/statement/q1',
		});
		expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.SENT);
	});

	it('leaves a marker that is not due yet', async () => {
		const fake = fakeDb([sub('a')]);
		fake.docs.set(markerPath, marker({ deliverAt: MORNING + HOUR }));

		const result = await processLargeQuestionDigests(fake.db, MORNING);

		expect(result.markers).toBe(0);
		expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.SKIPPED);
	});

	it('ignores a skipped queue item that is not a large-question marker', async () => {
		const fake = fakeDb([sub('a')]);
		fake.docs.set(markerPath, marker({ userId: 'someone' }));

		const result = await processLargeQuestionDigests(fake.db, MORNING);

		expect(result.markers).toBe(0);
		expect(queued(fake)).toHaveLength(0);
	});

	it('bounds how many markers one run takes', async () => {
		const fake = fakeDb([]);

		await processLargeQuestionDigests(fake.db, MORNING);

		expect(fake.queryLimits).toEqual([LARGE_QUESTION_DIGEST_RUN_LIMIT]);
	});

	it('stops taking markers once the time budget is spent', async () => {
		const fake = fakeDb([sub('a')]);
		fake.docs.set(markerPath, marker());

		const result = await processLargeQuestionDigests(fake.db, MORNING, () => false);

		expect(result.markers).toBe(0);
		expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.SKIPPED);
	});

	it('honours mutes, vetoes, snoozes and people on their own digest schedule', async () => {
		const fake = fakeDb(
			[
				sub('keep'),
				sub('muted'),
				sub('veto', { notifyOnNewAnswers: false }),
				sub('snoozed', { mutedUntil: MORNING + HOUR }),
				sub('daily', { notificationFrequency: NotificationFrequency.DAILY }),
				sub('inAppOnly', { getPushNotification: false }),
			],
			{ settings: { muted: { muted: true } } },
		);
		fake.docs.set(markerPath, marker());

		await processLargeQuestionDigests(fake.db, MORNING);

		expect(queuedUsers(fake)).toEqual(['keep']);
	});

	it('includes email only for people who turned it on', async () => {
		const fake = fakeDb([sub('both', { getEmailNotification: true })], {
			settings: { both: { defaultChannels: { email: true } } },
		});
		fake.docs.set(markerPath, marker());

		await processLargeQuestionDigests(fake.db, MORNING);

		expect(queued(fake)[0][1].channels).toEqual([
			NotificationChannel.PUSH,
			NotificationChannel.EMAIL,
		]);
	});

	it('creates an item for each of 1,116 people', async () => {
		const fake = fakeDb(Array.from({ length: 1116 }, (_, i) => sub(`u${i}`)));
		fake.docs.set(markerPath, marker());

		const result = await processLargeQuestionDigests(fake.db, MORNING);

		expect(result.queued).toBe(1116);
		expect(queued(fake)).toHaveLength(1116);
	});

	describe('who may receive it', () => {
		it.each([Role.banned, Role.waiting, Role.unsubscribed])('skips a %s person', async (role) => {
			const fake = fakeDb([sub('keep'), sub('blocked', { role })]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queuedUsers(fake)).toEqual(['keep']);
		});

		it.each([
			['gone', null],
			['hidden', { hide: true }],
		])('sends nothing about a question that is %s, and closes the marker', async (_, state) => {
			const fake = fakeDb([sub('a')], { question: state });
			fake.docs.set(markerPath, marker());

			const result = await processLargeQuestionDigests(fake.db, MORNING);

			expect(result).toEqual({ markers: 1, queued: 0, errors: 0 });
			expect(queued(fake)).toHaveLength(0);
			expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.SENT);
		});

		it('leaves out an author who was the only one to answer', async () => {
			const fake = fakeDb([sub('first-author'), sub('reader')]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queuedUsers(fake)).toEqual(['reader']);
		});

		it('includes the first author when others answered too', async () => {
			const fake = fakeDb([sub('first-author'), sub('reader')]);
			fake.docs.set(markerPath, marker({ multipleAuthors: true }));

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queuedUsers(fake).sort()).toEqual(['first-author', 'reader']);
		});
	});

	describe('push tokens, as the instant path resolves them', () => {
		it('prefers the tokens in pushNotifications', async () => {
			const fake = fakeDb([sub('a')], { pushDocs: [{ token: 'owned', userId: 'a' }] });
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake)[0][1].pushTokens).toEqual(['owned']);
		});

		it('falls back to the subscription tokens when there are none', async () => {
			const fake = fakeDb([sub('a', { tokens: ['from-subscription'] })]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake)[0][1].pushTokens).toEqual(['from-subscription']);
		});

		it('skips devices tagged for another app', async () => {
			const fake = fakeDb([sub('a', { tokens: [] })], {
				pushDocs: [
					{ token: 'class-device', userId: 'a', app: 'join-class' },
					{ token: 'phone', userId: 'a' },
				],
			});
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake)[0][1].pushTokens).toEqual(['phone']);
		});

		it('sends a device shared by two people only once', async () => {
			const fake = fakeDb([sub('a', { tokens: ['shared'] }), sub('b', { tokens: ['shared'] })]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake).flatMap(([, doc]) => doc.pushTokens as string[])).toEqual(['shared']);
		});

		it('queues nothing for someone with no device and no email', async () => {
			const fake = fakeDb([sub('a', { tokens: [] })]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake)).toHaveLength(0);
		});

		it('keeps someone in quiet hours and waits for the window to end', async () => {
			mockQuietUsers.add('sleeping');
			const fake = fakeDb([sub('sleeping'), sub('awake')]);
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			const byUser = new Map(queued(fake).map(([, doc]) => [doc.userId, doc]));
			expect(byUser.get('sleeping')).toMatchObject({
				deliverAt: mockQuietEnd,
				pushTokens: ['sleeping-token'],
			});
			expect(byUser.get('awake')).toMatchObject({ deliverAt: null });
		});

		it('holds the whole digest, email included, for someone in quiet hours', async () => {
			mockQuietUsers.add('sleeping');
			const fake = fakeDb([sub('sleeping', { getEmailNotification: true })], {
				settings: { sleeping: { defaultChannels: { email: true } } },
			});
			fake.docs.set(markerPath, marker());

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(queued(fake)[0][1]).toMatchObject({
				channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
				deliverAt: mockQuietEnd,
			});
		});
	});

	describe('repeated and failed runs', () => {
		it('never resets a digest an overlapping run already sent', async () => {
			const fake = fakeDb([sub('a'), sub('b')]);
			fake.docs.set(markerPath, marker());
			fake.docs.set(itemPath('a'), { userId: 'a', status: NotificationQueueStatus.SENT });

			const result = await processLargeQuestionDigests(fake.db, MORNING);

			expect(result).toEqual({ markers: 1, queued: 1, errors: 0 });
			expect(fake.docs.get(itemPath('a'))?.status).toBe(NotificationQueueStatus.SENT);
			expect(queuedUsers(fake)).toEqual(['b']);
		});

		it('after a failed write, the next run queues only those who were missed', async () => {
			let failing = true;
			const fake = fakeDb([sub('a'), sub('b')], {
				failCreate: (id) => failing && id.includes('_b_'),
			});
			fake.docs.set(markerPath, marker());

			const first = await processLargeQuestionDigests(fake.db, MORNING);

			expect(first.errors).toBe(1);
			expect(fake.docs.get(markerPath)).toMatchObject({
				status: NotificationQueueStatus.SKIPPED,
				retryCount: 1,
			});
			expect(queuedUsers(fake)).toEqual(['a']);

			failing = false;
			const second = await processLargeQuestionDigests(fake.db, MORNING + HOUR);

			expect(second).toEqual({ markers: 1, queued: 1, errors: 0 });
			expect(queuedUsers(fake).sort()).toEqual(['a', 'b']);
			expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.SENT);
		});

		it('stops retrying a marker after the last allowed failure', async () => {
			const fake = fakeDb([sub('a')], { failCreate: () => true });
			fake.docs.set(markerPath, marker({ retryCount: LARGE_QUESTION_DIGEST_MAX_RETRIES - 1 }));

			await processLargeQuestionDigests(fake.db, MORNING);

			expect(fake.docs.get(markerPath)?.status).toBe(NotificationQueueStatus.FAILED);
			expect(mockLogError).toHaveBeenCalled();
		});
	});
});

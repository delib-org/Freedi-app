import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
	NotificationFrequency,
	StatementType,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

type TestSubscription = Partial<StatementSubscription> & { userId: string };
interface MockBatch {
	writes: Array<{ collection: string; id: string; data: Record<string, unknown> }>;
}

let mockSubscriptions: TestSubscription[] = [];
let mockFailBatch: (batch: MockBatch) => boolean = () => false;
const mockCommitted: MockBatch[] = [];
const mockCreated: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];

jest.mock('../../index', () => {
	const collection = (name: string) => {
		if (name === 'pushNotifications') {
			return {
				where: () => ({ select: () => ({ get: async () => ({ docs: [] }) }) }),
			};
		}

		const query = (filters: Record<string, unknown>) => ({
			where: (field: string, _op: string, value: unknown) => query({ ...filters, [field]: value }),
			get: async () => ({
				docs: mockSubscriptions
					.filter((sub) =>
						Object.entries(filters).every(
							([field, value]) =>
								field === 'statementId' || sub[field as keyof TestSubscription] === value,
						),
					)
					.map((sub) => ({ data: () => sub })),
			}),
		});

		return {
			...query({}),
			doc: (id: string) => ({
				id,
				collection: name,
				create: async (data: Record<string, unknown>) => {
					mockCreated.push({ collection: name, id, data });
				},
			}),
		};
	};

	return {
		db: {
			collection,
			getAll: async (...refs: unknown[]) =>
				refs.map(() => ({ exists: false, data: () => undefined })),
			batch: () => {
				const batch: MockBatch = { writes: [] };

				return {
					set: (ref: { id: string; collection: string }, data: Record<string, unknown>) =>
						batch.writes.push({ collection: ref.collection, id: ref.id, data }),
					commit: async () => {
						if (mockFailBatch(batch)) throw new Error('commit failed');
						mockCommitted.push(batch);
					},
				};
			},
		},
	};
});

const mockSendPush = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();

jest.mock('../../fn_notifications', () => ({
	processFcmNotificationsImproved: (...args: unknown[]) => mockSendPush(...args),
}));

const mockSendEmail = jest.fn(async () => true);
jest.mock('../notificationEmail', () => ({
	sendNotificationEmail: () => mockSendEmail(),
}));

import { notifyStatementSubscribers } from '../notifyStatementSubscribers';
import { LARGE_QUESTION_SUBSCRIBER_THRESHOLD } from '../largeQuestionDigest';

const answer = {
	statementId: 'a1',
	parentId: 'q1',
	statement: 'an answer',
	statementType: StatementType.option,
	createdAt: 1,
	creator: { uid: 'actor', displayName: 'Actor' },
} as unknown as Statement;

const question = {
	statementId: 'q1',
	statement: 'the question',
	statementType: StatementType.question,
} as unknown as Statement;

const chatMessage = {
	...answer,
	statementId: 'c1',
	statementType: StatementType.statement,
} as unknown as Statement;

function subscribers(
	count: number,
	extra: Partial<StatementSubscription> = {},
): TestSubscription[] {
	return Array.from({ length: count }, (_, i) => ({
		userId: `u${i}`,
		user: { uid: `u${i}` } as StatementSubscription['user'],
		getInAppNotification: true,
		getPushNotification: true,
		tokens: [`token-${i}`],
		...extra,
	}));
}

const inAppWrites = () =>
	mockCommitted.flatMap((batch) =>
		batch.writes.filter((write) => write.collection === 'inAppNotifications'),
	);
const digestMarkers = () => mockCreated.filter((doc) => doc.collection === 'notificationQueue');

describe('notifyStatementSubscribers at scale', () => {
	beforeEach(() => {
		mockSubscriptions = [];
		mockFailBatch = () => false;
		mockCommitted.length = 0;
		mockCreated.length = 0;
		mockLogError.mockClear();
		mockSendPush.mockReset();
		mockSendEmail.mockClear();
		mockSendPush.mockResolvedValue({ successful: 1, failed: 0, invalidTokens: [] });
	});

	describe('chunking', () => {
		it.each([
			[499, [499]],
			[500, [500]],
			[1116, [500, 500, 116]],
		])('writes in-app notices for %i recipients in batches %j', async (count, expected) => {
			mockSubscriptions = subscribers(count);

			await notifyStatementSubscribers(answer, question);

			expect(mockCommitted.map((batch) => batch.writes.length)).toEqual(expected);
			expect(new Set(inAppWrites().map((write) => write.id)).size).toBe(count);
		});

		it('gives every recipient a repeatable notice id, so a retry cannot duplicate', async () => {
			mockSubscriptions = subscribers(3);

			await notifyStatementSubscribers(answer, question);

			expect(inAppWrites().map((write) => write.id)).toEqual(['u0_a1', 'u1_a1', 'u2_a1']);
		});

		it('logs a failed chunk, keeps the others and does not throw', async () => {
			mockSubscriptions = subscribers(1116);
			mockFailBatch = (batch) => batch.writes[0].id === 'u500_a1';

			await expect(notifyStatementSubscribers(answer, question)).resolves.toBeUndefined();

			expect(inAppWrites()).toHaveLength(616);
			expect(mockLogError).toHaveBeenCalledTimes(1);
			expect(mockLogError.mock.calls[0][1]).toMatchObject({
				operation: 'notifications.notifyStatementSubscribers.commit',
				statementId: 'a1',
			});
		});

		it('still pushes when a chunk fails on a question below the threshold', async () => {
			mockSubscriptions = subscribers(3);
			mockFailBatch = () => true;

			await notifyStatementSubscribers(answer, question);

			expect(mockSendPush).toHaveBeenCalledTimes(1);
		});
	});

	describe('digest threshold', () => {
		it('pushes instantly at exactly the threshold', async () => {
			mockSubscriptions = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD);

			await notifyStatementSubscribers(answer, question);

			expect(mockSendPush).toHaveBeenCalledTimes(1);
			expect(digestMarkers()).toHaveLength(0);
		});

		it('sends no push above the threshold, and still writes every in-app notice', async () => {
			mockSubscriptions = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1);

			await notifyStatementSubscribers(answer, question);

			expect(mockSendPush).not.toHaveBeenCalled();
			expect(inAppWrites()).toHaveLength(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1);
			expect(digestMarkers()).toHaveLength(1);
			expect(digestMarkers()[0].data).toMatchObject({
				parentId: 'q1',
				targetPath: '/statement/q1',
			});
		});

		it('holds email for the digest too', async () => {
			mockSubscriptions = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1, {
				getEmailNotification: true,
				user: { uid: 'u', email: 'person@example.com' } as StatementSubscription['user'],
			}).map((sub, i) => ({
				...sub,
				user: { uid: `u${i}`, email: 'person@example.com' } as StatementSubscription['user'],
			}));

			await notifyStatementSubscribers(answer, question);

			expect(mockSendEmail).not.toHaveBeenCalled();
		});

		it('does not count people who turned new answers off', async () => {
			mockSubscriptions = [
				...subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD),
				{
					...subscribers(1)[0],
					userId: 'veto',
					user: { uid: 'veto' } as StatementSubscription['user'],
					notifyOnNewAnswers: false,
				},
			];

			await notifyStatementSubscribers(answer, question);

			expect(mockSendPush).toHaveBeenCalledTimes(1);
			expect(digestMarkers()).toHaveLength(0);
		});

		it('counts the person answering, so the path does not depend on who answers', async () => {
			const atThreshold = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD);
			const outsider = subscribers(1).map((sub) => ({
				...sub,
				userId: 'outsider',
				user: { uid: 'outsider' } as StatementSubscription['user'],
			}));
			const actor = subscribers(1).map((sub) => ({
				...sub,
				userId: 'actor',
				user: { uid: 'actor' } as StatementSubscription['user'],
			}));

			mockSubscriptions = [...atThreshold, ...actor];
			await notifyStatementSubscribers(answer, question);
			expect(mockSendPush).not.toHaveBeenCalled();
			expect(digestMarkers()).toHaveLength(1);

			mockCreated.length = 0;
			mockSubscriptions = [...atThreshold, ...outsider];
			await notifyStatementSubscribers(answer, question);
			expect(mockSendPush).not.toHaveBeenCalled();
			expect(digestMarkers()).toHaveLength(1);
		});

		it('still never notifies the person who answered', async () => {
			mockSubscriptions = subscribers(2).map((sub, i) =>
				i === 0
					? { ...sub, userId: 'actor', user: { uid: 'actor' } as StatementSubscription['user'] }
					: sub,
			);

			await notifyStatementSubscribers(answer, question);

			expect(inAppWrites().map((write) => write.id)).toEqual(['u1_a1']);
		});

		it('leaves a chat message instant in a large question', async () => {
			mockSubscriptions = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1);

			await notifyStatementSubscribers(chatMessage, question);

			expect(mockSendPush).toHaveBeenCalledTimes(1);
			expect(digestMarkers()).toHaveLength(0);
		});

		it('keeps the held record of someone who chose a daily digest', async () => {
			mockSubscriptions = subscribers(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1, {
				notificationFrequency: NotificationFrequency.DAILY,
			});

			await notifyStatementSubscribers(answer, question);

			const held = mockCommitted.flatMap((batch) =>
				batch.writes.filter((write) => write.collection === 'notificationQueue'),
			);
			expect(held).toHaveLength(LARGE_QUESTION_SUBSCRIBER_THRESHOLD + 1);
		});
	});
});

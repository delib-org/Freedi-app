import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
	Collections,
	Role,
	StatementType,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type TestSubscription = Partial<StatementSubscription> & {
	userId: string;
	statementId: string;
	docId?: string;
};
interface MockWrite {
	collection: string;
	data: { userId: string };
}

let mockSubscriptions: TestSubscription[] = [];
const mockWrites: MockWrite[] = [];

jest.mock('../../index', () => {
	const collection = (name: string) => {
		if (name === 'pushNotifications') {
			return {
				where: (_field: string, _op: string, userIds: string[]) => ({
					select: () => ({
						get: async () => ({
							docs: userIds.map((userId) => ({
								id: `token-${userId}`,
								data: () => ({ token: `token-${userId}`, userId }),
							})),
						}),
					}),
				}),
			};
		}

		const query = (filters: Record<string, unknown>) => ({
			where: (field: string, _op: string, value: unknown) => query({ ...filters, [field]: value }),
			get: async () => ({
				docs: mockSubscriptions
					.filter((sub) =>
						Object.entries(filters).every(
							([field, value]) => sub[field as keyof TestSubscription] === value,
						),
					)
					.map((sub) => ({
						id: sub.docId ?? `${sub.userId}--${sub.statementId}`,
						data: () => sub,
					})),
			}),
		});

		return { ...query({}), doc: (id: string) => ({ id, collection: name }) };
	};

	return {
		db: {
			collection,
			getAll: async (...refs: unknown[]) =>
				refs.map(() => ({ exists: false, data: () => undefined })),
			batch: () => ({
				set: (ref: { collection: string }, data: { userId: string }) => {
					mockWrites.push({ collection: ref.collection, data });
				},
				commit: async () => undefined,
			}),
		},
	};
});

const mockSendPush = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();

jest.mock('../../fn_notifications', () => ({
	processFcmNotificationsImproved: (...args: unknown[]) => mockSendPush(...args),
}));

jest.mock('../notificationEmail', () => ({
	sendNotificationEmail: jest.fn(async () => true),
}));

import { notifyStatementSubscribers } from '../notifyStatementSubscribers';

const QUESTION = 'question';
const ANSWER = 'answer';

const reply = {
	statementId: 'reply',
	parentId: QUESTION,
	statement: 'reply',
	statementType: StatementType.statement,
	createdAt: 1,
	creator: { uid: 'actor', displayName: 'Actor' },
} as unknown as Statement;

const question = {
	statementId: QUESTION,
	statement: 'question',
	statementType: StatementType.question,
	parentId: 'top',
	parents: ['top'],
	topParentId: QUESTION,
} as unknown as Statement;

const replyOnAnswer = { ...reply, parentId: ANSWER } as Statement;

const answer = {
	statementId: ANSWER,
	statement: 'answer',
	statementType: StatementType.option,
	parentId: QUESTION,
	parents: ['top', QUESTION],
	topParentId: QUESTION,
} as unknown as Statement;

function subscriber(
	userId: string,
	role: Role,
	statementId: string = QUESTION,
	extra: Partial<TestSubscription> = {},
): TestSubscription {
	return {
		userId,
		statementId,
		role,
		user: { uid: userId } as StatementSubscription['user'],
		getPushNotification: true,
		getInAppNotification: true,
		...extra,
	};
}

function pushedTo(): string[] {
	const call = mockSendPush.mock.calls[0];
	if (!call) return [];

	return (call[0] as Array<{ userId: string }>).map((recipient) => recipient.userId).sort();
}

function inAppRowsFor(): string[] {
	return mockWrites
		.filter((write) => write.collection === Collections.inAppNotifications)
		.map((write) => write.data.userId)
		.sort();
}

describe('notifyStatementSubscribers and people who are not members', () => {
	beforeEach(() => {
		mockSubscriptions = [];
		mockWrites.length = 0;
		mockSendPush.mockReset();
		mockSendPush.mockResolvedValue({ successful: 1, failed: 0, invalidTokens: [] });
	});

	it('gives a banned and a waiting subscriber no push and no in-app row, and a member both', async () => {
		mockSubscriptions = [
			subscriber('banned', Role.banned),
			subscriber('waiting', Role.waiting),
			subscriber('member', Role.member),
		];

		await notifyStatementSubscribers(reply, question);

		expect(pushedTo()).toEqual(['member']);
		expect(inAppRowsFor()).toEqual(['member']);
	});

	it('starts notifying a waiting person once they are approved', async () => {
		mockSubscriptions = [subscriber('approved', Role.waiting)];
		await notifyStatementSubscribers(reply, question);
		expect(mockSendPush).not.toHaveBeenCalled();

		mockSubscriptions = [subscriber('approved', Role.member)];
		await notifyStatementSubscribers(reply, question);

		expect(pushedTo()).toEqual(['approved']);
		expect(inAppRowsFor()).toEqual(['approved']);
	});

	it('does not reach someone banned on the question through a subscription on one of its answers', async () => {
		mockSubscriptions = [
			subscriber('banned-above', Role.member, ANSWER),
			subscriber('banned-above', Role.banned, QUESTION),
			subscriber('member', Role.member, ANSWER),
		];

		await notifyStatementSubscribers(replyOnAnswer, answer);

		expect(pushedTo()).toEqual(['member']);
		expect(inAppRowsFor()).toEqual(['member']);
	});

	it('still notifies someone waiting higher up who belongs to this statement', async () => {
		mockSubscriptions = [
			subscriber('member-here', Role.member, ANSWER),
			subscriber('member-here', Role.waiting, QUESTION),
		];

		await notifyStatementSubscribers(replyOnAnswer, answer);

		expect(pushedTo()).toEqual(['member-here']);
	});

	it('does not let an old copy of a subscription bring a banned person back', async () => {
		mockSubscriptions = [
			subscriber('banned', Role.banned),
			subscriber('banned', Role.member, QUESTION, { docId: 'old-copy' }),
			subscriber('member', Role.member),
		];

		await notifyStatementSubscribers(reply, question);

		expect(pushedTo()).toEqual(['member']);
		expect(inAppRowsFor()).toEqual(['member']);
	});

	it('does not let a doc stored under another id silence the person it names', async () => {
		mockSubscriptions = [
			subscriber('victim', Role.member),
			subscriber('victim', Role.banned, QUESTION, { docId: 'forged' }),
		];

		await notifyStatementSubscribers(reply, question);

		expect(pushedTo()).toEqual(['victim']);
	});

	it('does not shut out the person a banned server copy names in its user field', async () => {
		mockSubscriptions = [
			subscriber('creator', Role.admin),
			subscriber('banned-copy', Role.banned, QUESTION, {
				user: { uid: 'creator' } as StatementSubscription['user'],
			}),
		];

		await notifyStatementSubscribers(reply, question);

		expect(pushedTo()).toEqual(['creator']);
		expect(inAppRowsFor()).toEqual(['creator']);
	});
});

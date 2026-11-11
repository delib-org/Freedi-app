import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
	NotificationFrequency,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type TestSubscription = Partial<StatementSubscription> & { userId: string };

let mockSubscriptions: TestSubscription[] = [];
let mockPushDocs: Array<{ token: string; userId: string }> = [];
const mockLookups: string[][] = [];

jest.mock('../../index', () => {
	const collection = (name: string) => {
		if (name === 'pushNotifications') {
			return {
				where: (_field: string, _op: string, userIds: string[]) => ({
					select: () => ({
						get: async () => {
							mockLookups.push(userIds);

							return {
								docs: mockPushDocs
									.filter((doc) => userIds.includes(doc.userId))
									.map((doc) => ({ id: doc.token, data: () => doc })),
							};
						},
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
							([field, value]) =>
								field === 'statementId' || sub[field as keyof TestSubscription] === value,
						),
					)
					.map((sub) => ({ data: () => sub })),
			}),
		});

		return { ...query({}), doc: (id: string) => ({ id }) };
	};

	return {
		db: {
			collection,
			getAll: async (...refs: unknown[]) =>
				refs.map(() => ({ exists: false, data: () => undefined })),
			batch: () => ({ set: jest.fn(), commit: jest.fn(async () => undefined) }),
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

const statement = {
	statementId: 's1',
	parentId: 'p1',
	statement: 'reply',
	createdAt: 1,
	creator: { uid: 'actor', displayName: 'Actor' },
} as unknown as Statement;

const parent = { statementId: 'p1', statement: 'parent' } as unknown as Statement;

function subscriber(userId: string, extra: Partial<StatementSubscription> = {}): TestSubscription {
	return {
		userId,
		user: { uid: userId } as StatementSubscription['user'],
		getPushNotification: true,
		...extra,
	};
}

describe('notifyStatementSubscribers push delivery', () => {
	beforeEach(() => {
		mockSubscriptions = [];
		mockPushDocs = [];
		mockLookups.length = 0;
		mockSendPush.mockResolvedValue({ successful: 1, failed: 0, invalidTokens: [] });
	});

	it('sends to the new place and, only for a user with none there, the subscription', async () => {
		mockSubscriptions = [
			subscriber('new-user', { tokens: ['stale-copy'] }),
			subscriber('old-user', { tokens: ['old'] }),
		];
		mockPushDocs = [{ token: 'new', userId: 'new-user' }];

		await notifyStatementSubscribers(statement, parent);

		expect(mockSendPush.mock.calls[0][0]).toEqual([
			{ userId: 'new-user', token: 'new' },
			{ userId: 'old-user', token: 'old' },
		]);
	});

	it('finds tokens by userId on a server copy whose user field holds the creator', async () => {
		mockSubscriptions = [
			subscriber('real', { user: { uid: 'creator' } as StatementSubscription['user'] }),
		];
		mockPushDocs = [
			{ token: 'real-device', userId: 'real' },
			{ token: 'creator-device', userId: 'creator' },
		];

		await notifyStatementSubscribers(statement, parent);

		expect(mockSendPush.mock.calls[0][0]).toEqual([{ userId: 'real', token: 'real-device' }]);
	});

	it('does not read tokens for a digest subscriber', async () => {
		mockSubscriptions = [
			subscriber('digest', { notificationFrequency: NotificationFrequency.DAILY, tokens: ['t'] }),
		];

		await notifyStatementSubscribers(statement, parent);

		expect(mockLookups).toEqual([]);
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it('never looks up the author of the statement', async () => {
		mockSubscriptions = [subscriber('actor', { tokens: ['t'] }), subscriber('other')];

		await notifyStatementSubscribers(statement, parent);

		expect(mockLookups).toEqual([['other']]);
	});
});

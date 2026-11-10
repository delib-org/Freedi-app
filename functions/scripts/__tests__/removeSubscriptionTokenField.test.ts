import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { FakeFirestore } from '../../src/userFeed/__tests__/fakeFirestore';

const FIELD_DELETED = '__field_deleted__';
const mockBackfill = jest.fn(async () => ({ toCreate: 0 }));

jest.mock('firebase-admin/firestore', () => ({
	FieldPath: { documentId: () => '__name__' },
	FieldValue: { delete: () => '__field_deleted__', arrayRemove: jest.fn() },
	getFirestore: jest.fn(),
}));

jest.mock('../backfillPushTokensFromSubscriptions', () => ({
	backfillPushTokens: (...args: unknown[]) => mockBackfill(...(args as [])),
	EXISTING_DOC_LOOKUP_CHUNK: 2,
}));

import { removeSubscriptionTokenField } from '../removeSubscriptionTokenField';

const SUBS = Collections.statementsSubscribe;
const PUSH = Collections.pushNotifications;
const AWAITING = Collections.awaitingUsers;

describe('removeSubscriptionTokenField', () => {
	let fake: FakeFirestore;
	const db = (): Firestore => fake as unknown as Firestore;
	const tokensOf = (id: string): unknown => fake.read(SUBS, id)?.tokens;

	beforeEach(() => {
		jest.clearAllMocks();
		fake = new FakeFirestore();
	});

	it('changes nothing on a dry run but still counts', async () => {
		fake.seed(SUBS, 'a', { tokens: ['t1'], getPushNotification: true, userId: 'u1' });
		fake.seed(PUSH, 't1', { userId: 'u1' });
		fake.seed(AWAITING, 'w1', { tokens: ['t1'] });

		const report = await removeSubscriptionTokenField(db(), false);

		expect(report).toMatchObject({
			execute: false,
			subscriptionsWithField: 1,
			subscriptionsCleared: 0,
			blockedByMissingOwnerDoc: 0,
			awaitingUsersWithField: 1,
			awaitingUsersCleared: 0,
		});
		expect(tokensOf('a')).toEqual(['t1']);
		expect(fake.read(AWAITING, 'w1')?.tokens).toEqual(['t1']);
		expect(mockBackfill).toHaveBeenCalledWith(expect.anything(), false, expect.any(Number));
	});

	it('removes the field and runs the backfill first when executing', async () => {
		const order: string[] = [];
		mockBackfill.mockImplementationOnce(async () => {
			order.push('backfill');
			fake.seed(PUSH, 't1', { userId: 'u1' });

			return { toCreate: 1 };
		});
		fake.seed(SUBS, 'a', { tokens: ['t1'], getPushNotification: true, userId: 'u1' });

		const report = await removeSubscriptionTokenField(db(), true);
		order.push('cleared');

		expect(order).toEqual(['backfill', 'cleared']);
		expect(report.subscriptionsCleared).toBe(1);
		expect(tokensOf('a')).toBe(FIELD_DELETED);
	});

	it('keeps a push-enabled subscription whose token has no pushNotifications doc', async () => {
		fake.seed(SUBS, 'a', { tokens: ['orphan'], getPushNotification: true, userId: 'u1' });
		fake.seed(SUBS, 'b', { tokens: ['t2'], getPushNotification: true, userId: 'u1' });
		fake.seed(PUSH, 't2', { userId: 'u1' });

		const report = await removeSubscriptionTokenField(db(), true);

		expect(report.blockedByMissingOwnerDoc).toBe(1);
		expect(report.subscriptionsCleared).toBe(1);
		expect(tokensOf('a')).toEqual(['orphan']);
		expect(tokensOf('b')).toBe(FIELD_DELETED);
	});

	it('clears a switched-off subscription without needing a pushNotifications doc', async () => {
		fake.seed(SUBS, 'off', { tokens: ['nobody'], getPushNotification: false, userId: 'u1' });

		const report = await removeSubscriptionTokenField(db(), true);

		expect(report.blockedByMissingOwnerDoc).toBe(0);
		expect(tokensOf('off')).toBe(FIELD_DELETED);
	});

	it('clears a token owned by someone else without touching their doc', async () => {
		fake.seed(SUBS, 'a', { tokens: ['shared'], getPushNotification: true, userId: 'u1' });
		fake.seed(PUSH, 'shared', { userId: 'current-owner' });

		await removeSubscriptionTokenField(db(), true);

		expect(tokensOf('a')).toBe(FIELD_DELETED);
		expect(fake.read(PUSH, 'shared')).toEqual({ userId: 'current-owner' });
	});

	it('clears the token copies on awaitingUsers', async () => {
		fake.seed(AWAITING, 'w1', { tokens: ['t1'], adminIds: ['a1'] });

		const report = await removeSubscriptionTokenField(db(), true);

		expect(report.awaitingUsersCleared).toBe(1);
		expect(fake.read(AWAITING, 'w1')?.tokens).toBe(FIELD_DELETED);
	});

	it('skips a malformed token instead of blocking its subscription', async () => {
		fake.seed(SUBS, 'a', { tokens: ['bad/token'], getPushNotification: true, userId: 'u1' });

		const report = await removeSubscriptionTokenField(db(), true);

		expect(report.blockedByMissingOwnerDoc).toBe(0);
		expect(tokensOf('a')).toBe(FIELD_DELETED);
	});

	it('leaves documents without the field alone', async () => {
		fake.seed(SUBS, 'plain', { getPushNotification: true, userId: 'u1' });

		const report = await removeSubscriptionTokenField(db(), true);

		expect(report.subscriptionsWithField).toBe(0);
		expect(fake.read(SUBS, 'plain')).toEqual({ getPushNotification: true, userId: 'u1' });
	});
});

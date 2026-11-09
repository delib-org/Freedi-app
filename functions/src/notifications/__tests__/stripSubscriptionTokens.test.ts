import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, type StatementSubscription } from '@freedi/shared-types';
import {
	FakeDocRef,
	FakeFirestore,
	FirestoreCodeError,
} from '../../userFeed/__tests__/fakeFirestore';

const mockLogError = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { delete: () => '__field_deleted__', arrayRemove: jest.fn() },
}));

jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import {
	CREATED_SUBSCRIPTION_SOURCE,
	stripCreatedSubscriptionTokens,
	withoutPushTokens,
} from '../stripSubscriptionTokens';

const FIELD_DELETED = '__field_deleted__';
const SUBS = Collections.statementsSubscribe;
const PUSH = Collections.pushNotifications;
const SUB_ID = 'u1--s1';

type SubscriptionInput = Partial<StatementSubscription>;

describe('stripCreatedSubscriptionTokens', () => {
	let fake: FakeFirestore;
	const db = (): Firestore => fake as unknown as Firestore;
	const tokensField = (): unknown => fake.read(SUBS, SUB_ID)?.tokens;
	const pushSub = (extra: SubscriptionInput = {}): SubscriptionInput => ({
		userId: 'u1',
		statementId: 's1',
		getPushNotification: true,
		tokens: ['t1'],
		...extra,
	});

	beforeEach(() => {
		jest.clearAllMocks();
		fake = new FakeFirestore();
		fake.seed(SUBS, SUB_ID, { userId: 'u1', tokens: ['t1'] });
	});

	it('does no read or write for a subscription without the field', async () => {
		fake.seed(SUBS, SUB_ID, { userId: 'u1' });
		fake.resetCounters();

		await stripCreatedSubscriptionTokens(db(), SUB_ID, { userId: 'u1', statementId: 's1' });

		expect(fake.writes).toBe(0);
		expect(fake.reads).toBe(0);
	});

	it('registers an unknown device for its owner, then removes the field', async () => {
		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(fake.read(PUSH, 't1')).toMatchObject({
			token: 't1',
			userId: 'u1',
			source: CREATED_SUBSCRIPTION_SOURCE,
		});
		expect(tokensField()).toBe(FIELD_DELETED);
	});

	it('never takes over a token someone else already holds', async () => {
		fake.seed(PUSH, 't1', { token: 't1', userId: 'current-owner' });

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(fake.read(PUSH, 't1')).toEqual({ token: 't1', userId: 'current-owner' });
		expect(tokensField()).toBe(FIELD_DELETED);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('does not register a token from a subscription with push off', async () => {
		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub({ getPushNotification: false }));

		expect(fake.read(PUSH, 't1')).toBeUndefined();
		expect(tokensField()).toBe(FIELD_DELETED);
	});

	it('removes a malformed token without using it as a document id', async () => {
		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub({ tokens: ['bad/token'] }));

		expect(fake.size(PUSH)).toBe(0);
		expect(tokensField()).toBe(FIELD_DELETED);
	});

	it('keeps the field when registering failed, so the fallback still reaches the device', async () => {
		jest
			.spyOn(FakeDocRef.prototype, 'create')
			.mockRejectedValueOnce(new FirestoreCodeError(14, 'path pushNotifications/t1 unavailable'));

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(tokensField()).toEqual(['t1']);
		expect(mockLogError).toHaveBeenCalledTimes(1);
		const logged = mockLogError.mock.calls[0][0] as Error;
		expect(logged.message).not.toContain('t1');
		jest.restoreAllMocks();
	});

	it('stays quiet when the person already left', async () => {
		fake.rowsOf(SUBS).delete(SUB_ID);

		await expect(stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub())).resolves.toBeUndefined();

		expect(mockLogError).not.toHaveBeenCalled();
	});
});

describe('withoutPushTokens', () => {
	it('drops only the token list', () => {
		expect(withoutPushTokens({ userId: 'u1', tokens: ['t1'] })).toEqual({ userId: 'u1' });
	});
});

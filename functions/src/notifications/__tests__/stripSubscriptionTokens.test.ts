import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, type StatementSubscription } from '@freedi/shared-types';
import { FakeFirestore, FirestoreCodeError } from '../../userFeed/__tests__/fakeFirestore';

const mockLogError = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { delete: () => '__field_deleted__', arrayRemove: jest.fn() },
}));

jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));

import { stripCreatedSubscriptionTokens, withoutPushTokens } from '../stripSubscriptionTokens';

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

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('does no read or write for a subscription without the field', async () => {
		fake.seed(SUBS, SUB_ID, { userId: 'u1' });
		fake.resetCounters();

		await stripCreatedSubscriptionTokens(db(), SUB_ID, { userId: 'u1', statementId: 's1' });

		expect(fake.writes).toBe(0);
		expect(fake.reads).toBe(0);
	});

	it('removes the field once the device is registered to its owner', async () => {
		fake.seed(PUSH, 't1', { token: 't1', userId: 'u1' });

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(tokensField()).toBe(FIELD_DELETED);
		expect(fake.read(PUSH, 't1')).toEqual({ token: 't1', userId: 'u1' });
	});

	it('never changes a token someone else holds', async () => {
		fake.seed(PUSH, 't1', { token: 't1', userId: 'current-owner' });

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(fake.read(PUSH, 't1')).toEqual({ token: 't1', userId: 'current-owner' });
		expect(tokensField()).toBe(FIELD_DELETED);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('registers nothing and keeps the field for a token with no owner document', async () => {
		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(fake.size(PUSH)).toBe(0);
		expect(tokensField()).toEqual(['t1']);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('keeps the whole field when only one of its tokens has no owner document', async () => {
		fake.seed(PUSH, 't1', { token: 't1', userId: 'u1' });

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub({ tokens: ['t1', 't2'] }));

		expect(tokensField()).toEqual(['t1']);
		expect(fake.writesTo(SUBS)).toBe(0);
	});

	it('removes a token from a subscription with push off, without looking it up', async () => {
		fake.resetCounters();

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub({ getPushNotification: false }));

		expect(fake.reads).toBe(0);
		expect(tokensField()).toBe(FIELD_DELETED);
	});

	it('removes a malformed token without using it as a document id', async () => {
		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub({ tokens: ['bad/token'] }));

		expect(fake.size(PUSH)).toBe(0);
		expect(tokensField()).toBe(FIELD_DELETED);
	});

	it('keeps the field and logs no token when the lookup fails', async () => {
		jest
			.spyOn(FakeFirestore.prototype, 'getAll')
			.mockRejectedValueOnce(new FirestoreCodeError(14, 'path pushNotifications/t1 unavailable'));

		await stripCreatedSubscriptionTokens(db(), SUB_ID, pushSub());

		expect(tokensField()).toEqual(['t1']);
		expect(mockLogError).toHaveBeenCalledTimes(1);
		const logged = mockLogError.mock.calls[0][0] as Error;
		expect(logged.message).toBe('Could not strip push tokens (code 14)');
	});

	it('stays quiet when the person already left', async () => {
		fake.seed(PUSH, 't1', { token: 't1', userId: 'u1' });
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

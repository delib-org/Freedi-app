import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Collections, type StatementSubscription } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
	FIRESTORE_IN_MAX_VALUES,
	pushRecipientFromSubscription,
	resolveFcmSubscribers,
} from '../resolvePushTokens';

interface PushDoc {
	id: string;
	token?: string;
	userId: string;
	app?: string;
}

interface Harness {
	db: Firestore;
	lookups: string[][];
}

/** Fake Firestore answering `pushNotifications where userId in [...]` from `docs`. */
function createHarness(docs: PushDoc[], failOnLookup?: number): Harness {
	const lookups: string[][] = [];
	const db = {
		collection: (name: string) => {
			expect(name).toBe(Collections.pushNotifications);

			return {
				where: (field: string, op: string, userIds: string[]) => {
					expect([field, op]).toEqual(['userId', 'in']);

					return {
						select: () => ({
							get: async () => {
								lookups.push(userIds);
								if (lookups.length === failOnLookup) throw new Error('unavailable');

								return {
									docs: docs
										.filter((doc) => userIds.includes(doc.userId))
										.map((doc) => ({ id: doc.id, data: () => doc })),
								};
							},
						}),
					};
				},
			};
		},
	} as unknown as Firestore;

	return { db, lookups };
}

const owned = (userId: string, token: string): PushDoc => ({ id: token, token, userId });

describe('resolveFcmSubscribers', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('uses the token from the new place when the subscription has none', async () => {
		const { db } = createHarness([owned('u1', 'new')]);

		await expect(resolveFcmSubscribers(db, [{ userId: 'u1' }])).resolves.toEqual([
			{ userId: 'u1', token: 'new' },
		]);
	});

	it('falls back to the subscription tokens for a user with none in the new place', async () => {
		const { db } = createHarness([]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: 'u1', subscriptionTokens: ['old-a', 'old-b'] }]),
		).resolves.toEqual([
			{ userId: 'u1', token: 'old-a' },
			{ userId: 'u1', token: 'old-b' },
		]);
	});

	it('sends one push when a token is in both places', async () => {
		const { db } = createHarness([owned('u1', 'both')]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: 'u1', subscriptionTokens: ['both'] }]),
		).resolves.toEqual([{ userId: 'u1', token: 'both' }]);
	});

	it('ignores the subscription tokens of a user who has tokens in the new place', async () => {
		const { db } = createHarness([owned('u1', 'new')]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: 'u1', subscriptionTokens: ['old'] }]),
		).resolves.toEqual([{ userId: 'u1', token: 'new' }]);
	});

	it('returns nothing and reads nothing without recipients', async () => {
		const { db, lookups } = createHarness([]);

		await expect(resolveFcmSubscribers(db, [])).resolves.toEqual([]);
		expect(lookups).toEqual([]);
	});

	it('returns nothing when neither place has a token', async () => {
		const { db } = createHarness([]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: 'u1', subscriptionTokens: [] }]),
		).resolves.toEqual([]);
	});

	it('sends a shared device once, to its owner, when another recipient still lists it', async () => {
		const { db } = createHarness([owned('owner', 'shared')]);

		await expect(
			resolveFcmSubscribers(db, [
				{ userId: 'previous', subscriptionTokens: ['shared'] },
				{ userId: 'owner' },
			]),
		).resolves.toEqual([{ userId: 'owner', token: 'shared' }]);
	});

	it('leaves join-class devices out and still falls back for their owner', async () => {
		const { db } = createHarness([{ ...owned('u1', 'class'), app: 'join-class' }]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: 'u1', subscriptionTokens: ['old'] }]),
		).resolves.toEqual([{ userId: 'u1', token: 'old' }]);
	});

	it('uses the document id for a doc from before the token field existed', async () => {
		const { db } = createHarness([{ id: 'id-token', userId: 'u1' }]);

		await expect(resolveFcmSubscribers(db, [{ userId: 'u1' }])).resolves.toEqual([
			{ userId: 'u1', token: 'id-token' },
		]);
	});

	it('merges repeated recipients and looks each user up once', async () => {
		const { db, lookups } = createHarness([]);

		const result = await resolveFcmSubscribers(db, [
			{ userId: 'u1', subscriptionTokens: ['a'] },
			{ userId: 'u1', subscriptionTokens: ['a', 'b'] },
		]);

		expect(result.map(({ token }) => token)).toEqual(['a', 'b']);
		expect(lookups).toEqual([['u1']]);
	});

	it('keeps the subscription tokens of a doc with no user, without querying for it', async () => {
		const { db, lookups } = createHarness([]);

		await expect(
			resolveFcmSubscribers(db, [{ userId: '', subscriptionTokens: ['orphan'] }]),
		).resolves.toEqual([{ userId: '', token: 'orphan' }]);
		expect(lookups).toEqual([]);
	});

	it('looks up large lists in the largest chunks Firestore allows', async () => {
		const total = FIRESTORE_IN_MAX_VALUES * 2 + 1;
		const recipients = Array.from({ length: total }, (_, i) => ({ userId: `u${i}` }));
		const { db, lookups } = createHarness(
			recipients.map(({ userId }) => owned(userId, `t-${userId}`)),
		);

		const result = await resolveFcmSubscribers(db, recipients);

		expect(FIRESTORE_IN_MAX_VALUES).toBe(30);
		expect(lookups.map((ids) => ids.length)).toEqual([30, 30, 1]);
		expect(new Set(lookups.flat()).size).toBe(total);
		expect(result).toHaveLength(total);
	});

	it('falls back for only the chunk whose lookup failed, and logs no token', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const recipients = Array.from({ length: FIRESTORE_IN_MAX_VALUES + 1 }, (_, i) => ({
			userId: `u${i}`,
			subscriptionTokens: [`old-${i}`],
		}));
		const { db } = createHarness(
			recipients.map(({ userId }, i) => owned(userId, `new-${i}`)),
			1,
		);

		const result = await resolveFcmSubscribers(db, recipients);

		expect(result).toHaveLength(FIRESTORE_IN_MAX_VALUES + 1);
		expect(result.filter(({ token }) => token.startsWith('old-'))).toHaveLength(
			FIRESTORE_IN_MAX_VALUES,
		);
		expect(result.find(({ userId }) => userId === `u${FIRESTORE_IN_MAX_VALUES}`)?.token).toBe(
			`new-${FIRESTORE_IN_MAX_VALUES}`,
		);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(String(errorSpy.mock.calls[0][0])).not.toContain('old-');
	});
});

describe('pushRecipientFromSubscription', () => {
	it('takes userId, not the creator a server copy stores in user', () => {
		const subscription = {
			userId: 'subscriber',
			user: { uid: 'statement-creator' },
			tokens: ['t'],
		} as unknown as StatementSubscription;

		expect(pushRecipientFromSubscription(subscription)).toEqual({
			userId: 'subscriber',
			subscriptionTokens: ['t'],
		});
	});

	it('uses user.uid on a legacy doc with no userId', () => {
		const subscription = { user: { uid: 'legacy' } } as unknown as StatementSubscription;

		expect(pushRecipientFromSubscription(subscription).userId).toBe('legacy');
	});
});

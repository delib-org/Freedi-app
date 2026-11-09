import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Collections } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const removeFromSubscriptions = jest.fn<(...args: unknown[]) => Promise<number>>();

jest.mock('../../utils/removeSubscriptionTokens', () => ({
	SUBSCRIPTION_TOKEN_BATCH_SIZE: 500,
	removeTokensFromUserSubscriptions: (...args: unknown[]) => removeFromSubscriptions(...args),
}));

import { removeInvalidTokens } from '../removeInvalidTokens';

interface Harness {
	db: Firestore;
	batches: string[][];
	collections: Set<string>;
}

function createHarness(failingBatch?: number): Harness {
	const batches: string[][] = [];
	const collections = new Set<string>();
	const db = {
		collection: (name: string) => ({
			doc: (id: string) => {
				collections.add(name);

				return { path: `${name}/${id}`, id };
			},
		}),
		batch: () => {
			const deletes: string[] = [];

			return {
				delete: (ref: { path: string }) => deletes.push(ref.path),
				commit: async () => {
					batches.push(deletes);
					if (batches.length === failingBatch) {
						throw Object.assign(new Error(`5 NOT_FOUND: ${deletes[0]}`), { code: 5 });
					}
				},
			};
		},
	} as unknown as Firestore;

	return { db, batches, collections };
}

describe('removeInvalidTokens', () => {
	beforeEach(() => {
		removeFromSubscriptions.mockResolvedValue(1);
	});

	it('does nothing for an empty list', async () => {
		const { db, batches } = createHarness();

		await removeInvalidTokens(db, []);

		expect(batches).toEqual([]);
		expect(removeFromSubscriptions).not.toHaveBeenCalled();
	});

	it('removes an invalid token from both places', async () => {
		const { db, batches } = createHarness();

		await removeInvalidTokens(db, [{ userId: 'u1', token: 'dead' }]);

		expect(batches).toEqual([[`${Collections.pushNotifications}/dead`]]);
		expect(removeFromSubscriptions).toHaveBeenCalledWith(db, 'u1', ['dead']);
	});

	it('no longer touches the legacy askedToBeNotified collection', async () => {
		const { db, collections } = createHarness();

		await removeInvalidTokens(db, [{ userId: 'u1', token: 'dead' }]);

		expect([...collections]).toEqual([Collections.pushNotifications]);
	});

	it('groups subscription cleanup by user', async () => {
		const { db } = createHarness();

		await removeInvalidTokens(db, [
			{ userId: 'u1', token: 'a' },
			{ userId: 'u1', token: 'b' },
			{ userId: 'u2', token: 'c' },
		]);

		expect(removeFromSubscriptions).toHaveBeenCalledTimes(2);
		expect(removeFromSubscriptions).toHaveBeenCalledWith(db, 'u1', ['a', 'b']);
		expect(removeFromSubscriptions).toHaveBeenCalledWith(db, 'u2', ['c']);
	});

	it('splits deletes into write batches of 500', async () => {
		const { db, batches } = createHarness();
		const invalid = Array.from({ length: 501 }, (_, i) => ({ userId: 'u1', token: `t${i}` }));

		await removeInvalidTokens(db, invalid);

		expect(batches.map((batch) => batch.length)).toEqual([500, 1]);
	});

	it('still cleans subscriptions when a delete fails, and logs no token', async () => {
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const { db } = createHarness(1);

		await expect(
			removeInvalidTokens(db, [{ userId: 'u1', token: 'secret-token' }]),
		).resolves.toBeUndefined();

		expect(removeFromSubscriptions).toHaveBeenCalledWith(db, 'u1', ['secret-token']);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(String(errorSpy.mock.calls[0][0])).not.toContain('secret-token');
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Written = { collection: string; id: string; data: Record<string, unknown> };

const { written, updated } = vi.hoisted(() => ({
	written: [] as Written[],
	updated: [] as unknown[],
}));

vi.mock('firebase-admin/firestore', () => ({
	FieldValue: {
		arrayUnion: (value: string) => ({ arrayUnion: value }),
		arrayRemove: (value: string) => ({ arrayRemove: value }),
	},
}));

vi.mock('../firebaseAdmin', () => ({
	adminDb: {
		collection: (collection: string) => ({
			doc: (id: string) => ({
				set: async (data: Record<string, unknown>) => {
					written.push({ collection, id, data });
				},
				update: async (data: unknown) => {
					updated.push(data);
				},
			}),
			where: () => {
				throw new Error('registration must not query subscriptions');
			},
		}),
		batch: () => {
			throw new Error('registration must not batch-write subscriptions');
		},
	},
}));

vi.mock('../conversation', () => ({
	getStatement: vi.fn(async (statementId: string) => ({
		statementId,
		statement: 'A question',
		statementType: 'question',
		creatorId: 'owner',
		creator: { uid: 'owner', displayName: 'Owner' },
		parentId: 'top',
		lastUpdate: 1,
		createdAt: 1,
	})),
}));

import {
	followQuestion,
	registerToken,
	setQuestionFrequency,
	unfollowQuestion,
} from '../pushActions';

const USER = { uid: 'u1', displayName: 'User', email: null, photoURL: null };
const SUBS = 'statementsSubscribe';
const PUSH = 'pushNotifications';

const writesTo = (collection: string): Written[] =>
	written.filter((write) => write.collection === collection);

describe('pushActions: a token is delivered from pushNotifications only', () => {
	beforeEach(() => {
		written.length = 0;
		updated.length = 0;
	});

	it('registers the device without touching any subscription', async () => {
		await registerToken(USER as never, 'device-1');

		expect(writesTo(PUSH)).toMatchObject([{ id: 'device-1', data: { userId: 'u1' } }]);
		expect(writesTo(SUBS)).toHaveLength(0);
		expect(updated).toHaveLength(0);
	});

	it('follows a question: the device is registered and push is on, with no token on the doc', async () => {
		await followQuestion(USER as never, 's1', 'device-1');

		expect(writesTo(PUSH)).toMatchObject([
			{ id: 'device-1', data: { token: 'device-1', userId: 'u1' } },
		]);
		const [subscription] = writesTo(SUBS);
		expect(subscription.data.getPushNotification).toBe(true);
		expect(subscription.data.userId).toBe('u1');
		expect(subscription.data).not.toHaveProperty('tokens');
		expect(subscription.data).not.toHaveProperty('lastTokenUpdate');
	});

	it('sets instant frequency: the device is registered and push is on, with no token on the doc', async () => {
		await setQuestionFrequency(USER as never, 's1', 'instant', 'device-1');

		expect(writesTo(PUSH)).toMatchObject([{ id: 'device-1', data: { userId: 'u1' } }]);
		const [subscription] = writesTo(SUBS);
		expect(subscription.data.getPushNotification).toBe(true);
		expect(subscription.data).not.toHaveProperty('tokens');
		expect(subscription.data).not.toHaveProperty('lastTokenUpdate');
	});

	it('leaves push alone for a frequency with no token', async () => {
		await setQuestionFrequency(USER as never, 's1', 'daily');

		const [subscription] = writesTo(SUBS);
		expect(subscription.data).not.toHaveProperty('getPushNotification');
		expect(subscription.data).not.toHaveProperty('tokens');
	});

	it('unfollow turns push off and only removes the device from the old list', async () => {
		await unfollowQuestion(USER as never, 's1', 'device-1');

		const [subscription] = writesTo(SUBS);
		expect(subscription.data.getPushNotification).toBe(false);
		expect(subscription.data.tokens).toEqual({ arrayRemove: 'device-1' });
	});
});

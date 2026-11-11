import { describe, it, expect } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { createFakeDb } from '../../progress/__tests__/fakeDb';
import {
	expectedSubscriptionId,
	genuineSubscriberUid,
	hasAdminSubscription,
	identityProblems,
	trustedAdminUids,
} from '../subscriptionIdentity';

const snap = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe('hasAdminSubscription', () => {
	const setup = () => {
		const fake = createFakeDb();

		return {
			seed: (id: string, data: Record<string, unknown>) =>
				fake.seed(Collections.statementsSubscribe, id, data),
			check: (uid: string, ids: readonly string[]) =>
				hasAdminSubscription(fake.db as unknown as Firestore, uid, ids),
		};
	};

	it.each(['admin', 'creator'])('admits role %s', async (role) => {
		const { seed, check } = setup();
		seed('u1--s1', { userId: 'u1', statementId: 's1', role });
		await expect(check('u1', ['s1'])).resolves.toBe(true);
	});

	it.each(['member', 'banned', 'waiting', 'statement-creator'])('refuses role %s', async (role) => {
		const { seed, check } = setup();
		seed('u1--s1', { userId: 'u1', statementId: 's1', role });
		await expect(check('u1', ['s1'])).resolves.toBe(false);
	});

	it('finds the admin doc on any of several statements, matching each id to its own doc', async () => {
		const { seed, check } = setup();
		seed('u1--s1', { userId: 'u1', statementId: 's1', role: 'member' });
		seed('u1--top', { userId: 'u1', statementId: 'top', role: 'admin' });
		await expect(check('u1', ['s1', 'top'])).resolves.toBe(true);
		await expect(check('u1', ['s1'])).resolves.toBe(false);
	});

	it('fails closed on a missing doc and on no statements at all', async () => {
		const { check } = setup();
		await expect(check('u1', ['s1', 'top'])).resolves.toBe(false);
		await expect(check('u1', [])).resolves.toBe(false);
	});

	it('refuses a doc stored under another id whose fields claim the statement', async () => {
		const { seed, check } = setup();
		seed('u1--own', { userId: 'u1', statementId: 's1', role: 'admin' });
		await expect(check('u1', ['s1'])).resolves.toBe(false);
	});

	it('refuses a doc at the right id whose fields disagree or are missing', async () => {
		const { seed, check } = setup();
		seed('u1--s1', { role: 'admin', statementId: 's1' });
		seed('u2--s1', { role: 'admin', userId: 'u2', statementId: 'other' });
		seed('u3--s1', { role: 'admin', userId: 'someone-else', statementId: 's1' });
		await expect(check('u1', ['s1'])).resolves.toBe(false);
		await expect(check('u2', ['s1'])).resolves.toBe(false);
		await expect(check('u3', ['s1'])).resolves.toBe(false);
	});
});

describe('subscription identity', () => {
	it('trusts only a doc whose id is `${userId}--${statementId}`', () => {
		expect(expectedSubscriptionId('u1', 's1')).toBe('u1--s1');
		expect(genuineSubscriberUid('u1--s1', { userId: 'u1', statementId: 's1' }, 's1')).toBe('u1');
		// Way B: the doc of s1 moved to claim the home
		expect(
			genuineSubscriberUid('u1--s1', { userId: 'u1', statementId: 'home' }, 'home'),
		).toBeUndefined();
		// Way A: the home's id holding another statement's fields
		expect(
			genuineSubscriberUid('u1--home', { userId: 'u1', statementId: 's1' }, 'home'),
		).toBeUndefined();
		expect(
			genuineSubscriberUid('u2--s1', { userId: 'u1', statementId: 's1' }, 's1'),
		).toBeUndefined();
		expect(genuineSubscriberUid('u1--s1', { statementId: 's1' }, 's1')).toBeUndefined();
		expect(genuineSubscriberUid('u1--s1', undefined, 's1')).toBeUndefined();
	});

	it('takes admin uids from userId of genuine admin docs only (setupAdminsForStatement)', () => {
		const docs = [
			snap('t1--home', {
				userId: 't1',
				statementId: 'home',
				role: 'admin',
				user: { uid: 'creator' },
			}),
			snap('evil--s9', {
				userId: 'evil',
				statementId: 'home',
				role: 'admin',
				user: { uid: 'evil' },
			}),
			snap('t2--home', { userId: 't2', statementId: 'home', role: 'member' }),
			snap('t3--home', { userId: 't3', statementId: 'home', role: 'admin' }),
		];
		expect(trustedAdminUids(docs, 'home')).toEqual(['t1', 't3']);
	});

	it('names what is wrong with an identity, for the scan', () => {
		expect(
			identityProblems('u1--s1', { userId: 'u1', statementId: 's1', user: { uid: 'u1' } }),
		).toEqual([]);
		expect(identityProblems('u1--home', { userId: 'u1', statementId: 's1' })).toEqual([
			'id-mismatch',
		]);
		expect(
			identityProblems('u1--s1', { userId: 'u1', statementId: 's1', user: { uid: 'x' } }),
		).toEqual(['user-mismatch']);
		expect(identityProblems('u1--s1', {})).toEqual(['id-mismatch']);
	});
});

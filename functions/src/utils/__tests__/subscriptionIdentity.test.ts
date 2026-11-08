import { describe, it, expect } from '@jest/globals';
import {
	expectedSubscriptionId,
	genuineSubscriberUid,
	identityProblems,
	trustedAdminUids,
} from '../subscriptionIdentity';

const snap = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

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

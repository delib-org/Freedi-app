import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockCollection = jest.fn(() => {
	throw new Error('reached the database');
});

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({ collection: mockCollection }),
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { fn_acceptJoinDelegateInvite } from '../fn_acceptJoinDelegateInvite';

type AcceptRequest = Parameters<typeof fn_acceptJoinDelegateInvite.run>[0];

function request(token: Record<string, unknown>): AcceptRequest {
	return {
		auth: { uid: 'u1', token },
		data: { token: 'invite-token' },
	} as unknown as AcceptRequest;
}

describe('fn_acceptJoinDelegateInvite email verification', () => {
	beforeEach(() => {
		mockCollection.mockClear();
	});

	it.each([
		['false', false],
		['missing', undefined],
		['the string "true"', 'true'],
	])('refuses a token whose email_verified is %s, before any lookup', async (_label, verified) => {
		await expect(
			fn_acceptJoinDelegateInvite.run(
				request({ email: 'a@example.com', email_verified: verified }),
			),
		).rejects.toMatchObject({ code: 'failed-precondition' });
		expect(mockCollection).not.toHaveBeenCalled();
	});

	it('goes on to look the invite up when the email is verified', async () => {
		await expect(
			fn_acceptJoinDelegateInvite.run(request({ email: 'a@example.com', email_verified: true })),
		).rejects.toThrow();
		expect(mockCollection).toHaveBeenCalledTimes(1);
	});
});

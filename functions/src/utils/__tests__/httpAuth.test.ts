import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'firebase-functions/v1';

/**
 * Unit tests for the admin HTTP auth/authorization gate.
 *
 * Covers the security fix: admin/maintenance HTTP endpoints must require a
 * system admin, not merely a valid token. The reviewer asked specifically for
 * "403 for non-admin, 200 for admin" — `requireSystemAdmin` is the gate that
 * decides this (returns the uid → handler runs → 200; or writes 403 → null).
 */

// Controllable mocks (the `mock` prefix lets them be referenced inside the
// hoisted jest.mock factories).
const mockVerifyIdToken = jest.fn<(token: string) => Promise<{ uid: string }>>();
const mockDocGet =
	jest.fn<() => Promise<{ exists: boolean; data: () => { systemAdmin?: boolean } | null }>>();

jest.mock('firebase-admin/auth', () => ({
	getAuth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => ({
		collection: jest.fn(() => ({
			doc: jest.fn(() => ({ get: mockDocGet })),
		})),
	})),
}));

import { verifyAuthToken, isSystemAdmin, requireSystemAdmin } from '../httpAuth';

interface MockResponse {
	statusCode?: number;
	status: jest.Mock<(code: number) => MockResponse>;
	send: jest.Mock<(body?: unknown) => MockResponse>;
	json: jest.Mock<(body?: unknown) => MockResponse>;
}

function makeRes(): MockResponse {
	const res = {
		statusCode: undefined as number | undefined,
	} as MockResponse;
	res.status = jest.fn((code: number) => {
		res.statusCode = code;

		return res;
	});
	res.send = jest.fn(() => res);
	res.json = jest.fn(() => res);

	return res;
}

function makeReq(authorization?: string): Request {
	return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

const asRes = (res: MockResponse): Response => res as unknown as Response;

beforeEach(() => {
	jest.clearAllMocks();
});

describe('verifyAuthToken', () => {
	it('returns 401 and null when the Authorization header is missing', async () => {
		const res = makeRes();
		const uid = await verifyAuthToken(makeReq(), asRes(res));

		expect(uid).toBeNull();
		expect(res.status).toHaveBeenCalledWith(401);
		expect(mockVerifyIdToken).not.toHaveBeenCalled();
	});

	it('returns 401 and null when the header is not a Bearer token', async () => {
		const res = makeRes();
		const uid = await verifyAuthToken(makeReq('Basic abc'), asRes(res));

		expect(uid).toBeNull();
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it('returns the uid for a valid token', async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });
		const res = makeRes();
		const uid = await verifyAuthToken(makeReq('Bearer good-token'), asRes(res));

		expect(uid).toBe('user-123');
		expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
		expect(res.status).not.toHaveBeenCalled();
	});

	it('returns 401 and null when the token is invalid/expired', async () => {
		mockVerifyIdToken.mockRejectedValue(new Error('expired'));
		const res = makeRes();
		const uid = await verifyAuthToken(makeReq('Bearer bad-token'), asRes(res));

		expect(uid).toBeNull();
		expect(res.status).toHaveBeenCalledWith(401);
	});
});

describe('isSystemAdmin', () => {
	it('returns true when usersV2/{uid}.systemAdmin === true', async () => {
		mockDocGet.mockResolvedValue({ exists: true, data: () => ({ systemAdmin: true }) });

		await expect(isSystemAdmin('admin-1')).resolves.toBe(true);
	});

	it('returns false when systemAdmin is not true', async () => {
		mockDocGet.mockResolvedValue({ exists: true, data: () => ({ systemAdmin: false }) });

		await expect(isSystemAdmin('user-1')).resolves.toBe(false);
	});

	it('returns false when the user doc does not exist', async () => {
		mockDocGet.mockResolvedValue({ exists: false, data: () => null });

		await expect(isSystemAdmin('ghost')).resolves.toBe(false);
	});

	it('fails closed (returns false) when the lookup throws', async () => {
		mockDocGet.mockRejectedValue(new Error('firestore down'));

		await expect(isSystemAdmin('user-1')).resolves.toBe(false);
	});
});

describe('requireSystemAdmin', () => {
	it('returns 403 and null for an authenticated non-admin', async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
		mockDocGet.mockResolvedValue({ exists: true, data: () => ({ systemAdmin: false }) });
		const res = makeRes();

		const uid = await requireSystemAdmin(makeReq('Bearer token'), asRes(res));

		expect(uid).toBeNull();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('returns the uid (handler proceeds → 200) for a system admin', async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' });
		mockDocGet.mockResolvedValue({ exists: true, data: () => ({ systemAdmin: true }) });
		const res = makeRes();

		const uid = await requireSystemAdmin(makeReq('Bearer token'), asRes(res));

		expect(uid).toBe('admin-1');
		expect(res.status).not.toHaveBeenCalled();
	});

	it('returns 401 and null (no admin lookup) when unauthenticated', async () => {
		const res = makeRes();

		const uid = await requireSystemAdmin(makeReq(), asRes(res));

		expect(uid).toBeNull();
		expect(res.status).toHaveBeenCalledWith(401);
		expect(mockDocGet).not.toHaveBeenCalled();
	});
});

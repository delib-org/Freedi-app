import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'firebase-functions/v1';
import type { RateBudget } from '../../config/rateBudgets';

const mockVerifyIdToken =
	jest.fn<(token: string) => Promise<{ uid: string; firebase?: unknown }>>();
const mockPasses = jest.fn<() => Promise<boolean>>();

jest.mock('firebase-admin/auth', () => ({
	getAuth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => ({})),
	Timestamp: { fromMillis: (ms: number) => ms },
}));
jest.mock('../../db', () => ({ db: {} }));
jest.mock('../rateLimit', () => ({ passesHttpRateLimit: () => mockPasses() }));

import { withVerifiedUser } from '../httpAuth';

function makeRes() {
	const res = {
		statusCode: 200,
		status(code: number) {
			res.statusCode = code;

			return res;
		},
		send: () => res,
		json: () => res,
	};

	return res;
}

const request = (authorization?: string, body: Record<string, unknown> = {}) =>
	({ headers: authorization ? { authorization } : {}, body }) as unknown as Request;

describe('withVerifiedUser', () => {
	const handler = jest.fn<(req: Request, res: Response, uid: string) => Promise<void>>();

	beforeEach(() => {
		jest.clearAllMocks();
		handler.mockResolvedValue(undefined);
		mockPasses.mockResolvedValue(true);
	});

	it('returns 401 with no token and never runs the handler', async () => {
		const res = makeRes();
		await withVerifiedUser(handler)(request(), res as unknown as Response);

		expect(res.statusCode).toBe(401);
		expect(handler).not.toHaveBeenCalled();
	});

	it('returns 401 for an invalid token', async () => {
		mockVerifyIdToken.mockRejectedValue(new Error('bad'));
		const res = makeRes();
		await withVerifiedUser(handler)(request('Bearer nope'), res as unknown as Response);

		expect(res.statusCode).toBe(401);
		expect(handler).not.toHaveBeenCalled();
	});

	it('lets an anonymous user through, because MC and Join are zero-signup', async () => {
		mockVerifyIdToken.mockResolvedValue({
			uid: 'anon-uid',
			firebase: { sign_in_provider: 'anonymous' },
		});
		const res = makeRes();
		await withVerifiedUser(handler)(request('Bearer anon'), res as unknown as Response);

		expect(handler).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'anon-uid');
		expect(res.statusCode).toBe(200);
	});

	it('hands the token uid to the handler, whatever the body claims', async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: 'real-uid' });
		const res = makeRes();
		await withVerifiedUser(handler)(
			request('Bearer ok', { userId: 'forged', adminId: 'forged' }),
			res as unknown as Response,
		);

		expect(handler.mock.calls[0][2]).toBe('real-uid');
	});

	it('does not run the handler once the budget is refused', async () => {
		mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
		mockPasses.mockResolvedValue(false);
		const budget: RateBudget = { name: 'b', perUidPerHour: 1, globalPerDay: 1 };
		await withVerifiedUser(handler, budget)(request('Bearer ok'), makeRes() as unknown as Response);

		expect(handler).not.toHaveBeenCalled();
	});

	it('keeps the handler name for logging', () => {
		async function namedHandler(): Promise<void> {
			return undefined;
		}

		expect(withVerifiedUser(namedHandler).name).toBe('namedHandler');
	});
});

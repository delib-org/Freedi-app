import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { RateBudget } from '../../config/rateBudgets';

/**
 * The limiter is what bounds the AI and email bills, so these tests pin the
 * three budgets and the refusal behaviour against an in-memory Firestore.
 */

const mockDocs = new Map<string, Record<string, unknown>>();
const mockRunTransaction = jest.fn<(fn: (tx: unknown) => Promise<void>) => Promise<void>>();

jest.mock('../../db', () => ({
	db: {
		collection: (collection: string) => ({
			doc: (id: string) => ({ path: `${collection}/${id}` }),
		}),
		runTransaction: (fn: (tx: unknown) => Promise<void>) => mockRunTransaction(fn),
	},
}));

import {
	API_RATE_LIMITS_COLLECTION,
	clientIp,
	passesHttpRateLimit,
	reserveRateBudget,
	reserveWindowSlot,
} from '../rateLimit';

const budget: RateBudget = { name: 'test', perUidPerHour: 2, perIpPerHour: 3, globalPerDay: 5 };

function docsMatching(fragment: string): string[] {
	return [...mockDocs.keys()].filter((key) => key.includes(fragment));
}

beforeEach(() => {
	mockDocs.clear();
	mockRunTransaction.mockImplementation(async (fn) => {
		await fn({
			get: async (ref: { path: string }) => ({ data: () => mockDocs.get(ref.path) }),
			set: (ref: { path: string }, data: Record<string, unknown>) => {
				mockDocs.set(ref.path, { ...mockDocs.get(ref.path), ...data });
			},
		});
	});
});

describe('reserveRateBudget', () => {
	it('allows calls up to the per-uid limit and then trips', async () => {
		await reserveRateBudget(budget, 'u1', '1.1.1.1', 1000);
		await reserveRateBudget(budget, 'u1', '1.1.1.1', 1000);

		await expect(reserveRateBudget(budget, 'u1', '1.1.1.1', 1000)).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
	});

	it('trips the per-IP budget for fresh uids from one address', async () => {
		await reserveRateBudget(budget, 'a', '9.9.9.9', 1000);
		await reserveRateBudget(budget, 'b', '9.9.9.9', 1000);
		await reserveRateBudget(budget, 'c', '9.9.9.9', 1000);

		// A freshly minted anonymous uid does not buy more from the same address.
		await expect(reserveRateBudget(budget, 'd', '9.9.9.9', 1000)).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
	});

	it('enforces the global daily ceiling across uids and addresses', async () => {
		for (let i = 0; i < 5; i++) {
			await reserveRateBudget(budget, `u${i}`, `2.2.2.${i}`, 1000);
		}

		await expect(reserveRateBudget(budget, 'late', '3.3.3.3', 1000)).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
	});

	it('skips the IP budget when none is configured, so server routes are not counted as one user', async () => {
		const serverRouted: RateBudget = { name: 'routed', perUidPerHour: 5, globalPerDay: 1000 };
		await reserveRateBudget(serverRouted, 'u1', '76.76.21.21', 1000);

		expect(docsMatching('__ip__')).toEqual([]);
	});

	it('resets a window once it has passed', async () => {
		await reserveRateBudget(budget, 'u1', undefined, 1000);
		await reserveRateBudget(budget, 'u1', undefined, 1000);
		const hourLater = 1000 + 60 * 60 * 1000;

		await expect(reserveRateBudget(budget, 'u1', undefined, hourLater)).resolves.toBeUndefined();
	});

	it('stores addresses only as a digest', async () => {
		await reserveRateBudget(budget, 'u1', '8.8.4.4', 1000);

		expect(docsMatching('8.8.4.4')).toEqual([]);
		expect(docsMatching('__ip__')).toHaveLength(1);
	});
});

describe('reserveWindowSlot', () => {
	it('charges a multi-recipient cost against the limit', async () => {
		const slot = {
			collection: API_RATE_LIMITS_COLLECTION,
			docId: 'recipients',
			limit: 10,
			windowMs: 1000,
			label: 'recipients',
			now: 1,
		};
		await reserveWindowSlot({ ...slot, cost: 8 });

		await expect(reserveWindowSlot({ ...slot, cost: 3 })).rejects.toMatchObject({
			code: 'resource-exhausted',
		});
	});
});

describe('clientIp', () => {
	it('takes the last x-forwarded-for entry, not the forgeable first one', () => {
		expect(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.5' } })).toBe(
			'203.0.113.5',
		);
	});

	it('is undefined without the header', () => {
		expect(clientIp({ headers: {} })).toBeUndefined();
	});
});

describe('passesHttpRateLimit', () => {
	const makeRes = () => {
		const res = { status: jest.fn(), json: jest.fn() };
		res.status.mockReturnValue(res);

		return res;
	};
	const req = { headers: { 'x-forwarded-for': '203.0.113.9' } };

	it('writes a 429 once the budget is spent', async () => {
		const res = makeRes();
		const limited: RateBudget = { name: 'one', perUidPerHour: 1, globalPerDay: 100 };

		await expect(passesHttpRateLimit(req as never, res as never, limited, 'u1')).resolves.toBe(
			true,
		);
		await expect(passesHttpRateLimit(req as never, res as never, limited, 'u1')).resolves.toBe(
			false,
		);
		expect(res.status).toHaveBeenCalledWith(429);
	});

	it('fails open on contention for an AI budget, and still logs it', async () => {
		mockRunTransaction.mockRejectedValue(new Error('10 ABORTED: too much contention'));
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const res = makeRes();

		await expect(passesHttpRateLimit(req as never, res as never, budget, 'u1')).resolves.toBe(true);
		expect(res.status).not.toHaveBeenCalled();
		// uid, IP and global counters each failed and each was reported.
		expect(consoleError).toHaveBeenCalledTimes(3);
		consoleError.mockRestore();
	});

	it('still refuses a really exhausted global counter when the narrower ones hit contention', async () => {
		mockRunTransaction.mockRejectedValueOnce(new Error('aborted'));
		mockRunTransaction.mockRejectedValueOnce(new Error('aborted'));
		mockDocs.set(`${API_RATE_LIMITS_COLLECTION}/test__global__0`, { windowStart: 1, count: 5 });
		const clock = jest.spyOn(Date, 'now').mockReturnValue(2);
		const res = makeRes();
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

		await expect(passesHttpRateLimit(req as never, res as never, budget, 'u1')).resolves.toBe(
			false,
		);
		expect(res.status).toHaveBeenCalledWith(429);

		clock.mockRestore();
		consoleError.mockRestore();
	});

	it('fails closed for an email budget when Firestore cannot settle the transaction', async () => {
		mockRunTransaction.mockRejectedValue(new Error('aborted'));
		const res = makeRes();
		const emailBudget: RateBudget = { ...budget, failClosed: true };

		await expect(passesHttpRateLimit(req as never, res as never, emailBudget, 'u1')).resolves.toBe(
			false,
		);
		expect(res.status).toHaveBeenCalledWith(429);
	});
});

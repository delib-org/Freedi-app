import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('../index', () => ({ db: {} }));
jest.mock('firebase-functions', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockAssertAdmin = jest.fn<() => Promise<unknown>>();
jest.mock('../fn_recomputeTopOptions', () => ({ assertAdmin: () => mockAssertAdmin() }));

const mockReconcile = jest.fn<(id: string) => Promise<unknown>>();
jest.mock('../evaluation/evaluatorParticipation', () => ({
	reconcileParentEvaluators: (id: string) => mockReconcile(id),
}));

import { applyReconcileEvaluatorCount } from '../fn_reconcileEvaluatorCount';

const firestore = {} as Firestore;
const request = { statementId: 'q1' };

describe('applyReconcileEvaluatorCount', () => {
	beforeEach(() => {
		mockAssertAdmin.mockReset().mockResolvedValue({});
		mockReconcile.mockReset().mockResolvedValue({
			parentId: 'q1',
			previousCount: 9,
			count: 7,
			created: 1,
			removed: 3,
		});
	});

	it('rejects unauthenticated callers', async () => {
		await expect(applyReconcileEvaluatorCount(firestore, undefined, request)).rejects.toMatchObject(
			{
				code: 'unauthenticated',
			},
		);
		expect(mockReconcile).not.toHaveBeenCalled();
	});

	it('requires a statementId', async () => {
		await expect(applyReconcileEvaluatorCount(firestore, 'u1', undefined)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('does not recount for a non-admin', async () => {
		mockAssertAdmin.mockRejectedValue(
			Object.assign(new Error('no'), { code: 'permission-denied' }),
		);

		await expect(applyReconcileEvaluatorCount(firestore, 'u1', request)).rejects.toMatchObject({
			code: 'permission-denied',
		});
		expect(mockReconcile).not.toHaveBeenCalled();
	});

	it('returns the recount for an admin', async () => {
		await expect(applyReconcileEvaluatorCount(firestore, 'u1', request)).resolves.toMatchObject({
			success: true,
			previousCount: 9,
			count: 7,
		});
	});

	it('maps a failure to an internal error', async () => {
		mockReconcile.mockRejectedValue(new Error('boom'));

		await expect(applyReconcileEvaluatorCount(firestore, 'u1', request)).rejects.toMatchObject({
			code: 'internal',
		});
	});
});

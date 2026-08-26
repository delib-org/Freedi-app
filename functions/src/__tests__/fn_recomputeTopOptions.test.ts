import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

// Avoid importing the real ./index (which calls getFirestore on an
// uninitialized app). applyRecomputeTopOptions takes its Firestore as an argument.
jest.mock('../index', () => ({ db: {} }));
jest.mock('firebase-functions', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockRecompute = jest.fn<(parentId: string | undefined) => Promise<void>>();
jest.mock('../evaluation/updateChosenOptions', () => ({
	updateParentStatementWithChosenOptions: (parentId: string | undefined) => mockRecompute(parentId),
}));

import { applyRecomputeTopOptions } from '../fn_recomputeTopOptions';

interface DbShape {
	/** The statement doc, or null when it does not exist. */
	statement: Record<string, unknown> | null;
	/** Whether the subscription query finds an admin row for the caller. */
	isAdmin: boolean;
}

function makeDb({ statement, isAdmin }: DbShape): {
	firestore: Firestore;
	subscriptionQuery: { statementId?: unknown; userId?: unknown };
} {
	const captured: { statementId?: unknown; userId?: unknown } = {};

	const statementDocRef = {
		get: jest.fn(async () => ({
			exists: statement !== null,
			data: () => statement,
		})),
	};

	// Chainable `.where(...).where(...).limit(...).get()` for the subscription lookup.
	const query = {
		where: jest.fn((field: string, _op: string, value: unknown) => {
			if (field === 'statementId') captured.statementId = value;
			if (field === 'userId') captured.userId = value;

			return query;
		}),
		limit: jest.fn(() => query),
		get: jest.fn(async () => ({ empty: !isAdmin })),
	};

	const firestore = {
		collection: jest.fn((name: string) =>
			name === 'statements' ? { doc: jest.fn(() => statementDocRef) } : query,
		),
	} as unknown as Firestore;

	return { firestore, subscriptionQuery: captured };
}

const request = { statementId: 'q-1' };

describe('applyRecomputeTopOptions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRecompute.mockResolvedValue(undefined);
	});

	it('rejects an unauthenticated caller', async () => {
		const { firestore } = makeDb({ statement: {}, isAdmin: true });

		await expect(applyRecomputeTopOptions(firestore, undefined, request)).rejects.toThrow(
			/authenticated/i,
		);
		expect(mockRecompute).not.toHaveBeenCalled();
	});

	it('rejects a request with no statementId', async () => {
		const { firestore } = makeDb({ statement: {}, isAdmin: true });

		await expect(applyRecomputeTopOptions(firestore, 'u1', { statementId: '' })).rejects.toThrow(
			/statementId is required/i,
		);
	});

	it('rejects when the statement does not exist', async () => {
		const { firestore } = makeDb({ statement: null, isAdmin: true });

		await expect(applyRecomputeTopOptions(firestore, 'u1', request)).rejects.toThrow(/not found/i);
	});

	it('rejects a non-admin caller', async () => {
		const { firestore } = makeDb({ statement: { topParentId: 'root-1' }, isAdmin: false });

		await expect(applyRecomputeTopOptions(firestore, 'u1', request)).rejects.toThrow(
			/only admins/i,
		);
		expect(mockRecompute).not.toHaveBeenCalled();
	});

	it('checks the caller’s role against the top parent, where authorization is held', async () => {
		const { firestore, subscriptionQuery } = makeDb({
			statement: { topParentId: 'root-1' },
			isAdmin: true,
		});

		await applyRecomputeTopOptions(firestore, 'u1', request);

		expect(subscriptionQuery).toEqual({ statementId: 'root-1', userId: 'u1' });
	});

	it('falls back to the statement itself when it is the root', async () => {
		const { firestore, subscriptionQuery } = makeDb({ statement: {}, isAdmin: true });

		await applyRecomputeTopOptions(firestore, 'u1', request);

		expect(subscriptionQuery.statementId).toBe('q-1');
	});

	it('recomputes for an admin and reports success', async () => {
		const { firestore } = makeDb({ statement: { topParentId: 'root-1' }, isAdmin: true });

		await expect(applyRecomputeTopOptions(firestore, 'u1', request)).resolves.toEqual({
			success: true,
			statementId: 'q-1',
		});
		expect(mockRecompute).toHaveBeenCalledWith('q-1');
	});

	it('surfaces a recompute failure as an internal error', async () => {
		const { firestore } = makeDb({ statement: {}, isAdmin: true });
		mockRecompute.mockRejectedValue(new Error('firestore exploded'));

		await expect(applyRecomputeTopOptions(firestore, 'u1', request)).rejects.toThrow(
			/Failed to recompute top answers/i,
		);
	});
});

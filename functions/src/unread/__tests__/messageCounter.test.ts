import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import { logError } from '../../utils/errorHandling';
import {
	counterAncestorIds,
	isCountableMessage,
	recordMessageCreated,
	recordMessageDeleted,
} from '../messageCounter';

interface FakeRef {
	path: string;
	update: jest.Mock<(data: unknown) => Promise<void>>;
}

function makeDb(
	options: { existingSubs?: string[]; batchFails?: boolean; missing?: string[] } = {},
) {
	const refs = new Map<string, FakeRef>();
	const refFor = (path: string): FakeRef => {
		if (!refs.has(path)) {
			refs.set(path, {
				path,
				update: jest.fn(async () => {
					if (options.missing?.includes(path)) {
						throw Object.assign(new Error('not found'), { code: 5 });
					}
				}),
			});
		}

		return refs.get(path) as FakeRef;
	};
	const batchUpdates: Array<{ path: string; data: unknown }> = [];
	const db = {
		collection: (name: string) => ({ doc: (id: string) => refFor(`${name}/${id}`) }),
		getAll: jest.fn(async (...docRefs: FakeRef[]) =>
			docRefs.map((ref) => ({
				ref,
				exists: (options.existingSubs ?? []).includes(ref.path),
			})),
		),
		batch: () => ({
			update: (ref: FakeRef, data: unknown) => batchUpdates.push({ path: ref.path, data }),
			commit: jest.fn(async () => {
				if (options.batchFails) throw new Error('NOT_FOUND');
			}),
		}),
	};

	return { db: db as unknown as Firestore, batchUpdates, refs, getAll: db.getAll };
}

function message(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'm1',
		parentId: 'q1',
		parents: ['space', 'q1'],
		statementType: StatementType.statement,
		creatorId: 'alice',
		...overrides,
	} as Statement;
}

describe('isCountableMessage', () => {
	it('counts chat messages and answers only', () => {
		expect(isCountableMessage({ statementType: StatementType.statement })).toBe(true);
		expect(isCountableMessage({ statementType: StatementType.option })).toBe(true);
		expect(isCountableMessage({ statementType: StatementType.paragraph })).toBe(false);
		expect(isCountableMessage({ statementType: StatementType.question })).toBe(false);
		expect(isCountableMessage({ statementType: StatementType.group })).toBe(false);
	});
});

describe('counterAncestorIds', () => {
	it('merges parents and parentId without duplicates', () => {
		expect(counterAncestorIds(message())).toEqual(['space', 'q1']);
	});

	it('skips the top sentinel and the statement itself', () => {
		expect(
			counterAncestorIds({ statementId: 'm1', parentId: 'top', parents: ['top', 'm1'] }),
		).toEqual([]);
	});

	it('works when parents is missing', () => {
		expect(counterAncestorIds({ statementId: 'm1', parentId: 'q1' })).toEqual(['q1']);
	});
});

describe('recordMessageCreated', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('increments every ancestor and advances the sender where they follow', async () => {
		const { db, batchUpdates } = makeDb({ existingSubs: ['statementsSubscribe/alice--q1'] });
		await recordMessageCreated(db, message());

		expect(batchUpdates).toEqual([
			{ path: 'statements/space', data: { descendantMessageCount: { __increment: 1 } } },
			{ path: 'statements/q1', data: { descendantMessageCount: { __increment: 1 } } },
			{ path: 'statementsSubscribe/alice--q1', data: { seenMessageCount: { __increment: 1 } } },
		]);
	});

	it('reads the sender subscriptions with one getAll', async () => {
		const { db, getAll } = makeDb();
		await recordMessageCreated(db, message());
		expect(getAll).toHaveBeenCalledTimes(1);
	});

	it('does nothing for a paragraph', async () => {
		const { db, batchUpdates, getAll } = makeDb();
		await recordMessageCreated(db, message({ statementType: StatementType.paragraph }));
		expect(batchUpdates).toEqual([]);
		expect(getAll).not.toHaveBeenCalled();
	});

	it('does nothing for a top-level statement', async () => {
		const { db, batchUpdates } = makeDb();
		await recordMessageCreated(db, message({ parentId: 'top', parents: [] }));
		expect(batchUpdates).toEqual([]);
	});

	it('falls back to single updates when the batch fails and ignores missing docs', async () => {
		const { db, refs } = makeDb({ batchFails: true, missing: ['statements/space'] });
		await recordMessageCreated(db, message());
		expect(refs.get('statements/q1')?.update).toHaveBeenCalledTimes(1);
		expect(logError).not.toHaveBeenCalled();
	});

	it('never throws and logs when the read fails', async () => {
		const { db } = makeDb();
		(db as unknown as { getAll: () => Promise<never> }).getAll = async () => {
			throw new Error('boom');
		};
		await expect(recordMessageCreated(db, message())).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalled();
	});
});

describe('recordMessageDeleted', () => {
	it('decrements every ancestor and leaves subscriptions alone', async () => {
		const { db, batchUpdates, getAll } = makeDb();
		await recordMessageDeleted(db, message({ statementType: StatementType.option }));
		expect(batchUpdates.map((u) => u.path)).toEqual(['statements/space', 'statements/q1']);
		expect(batchUpdates[0].data).toEqual({ descendantMessageCount: { __increment: -1 } });
		expect(getAll).not.toHaveBeenCalled();
	});

	it('ignores uncountable types', async () => {
		const { db, batchUpdates } = makeDb();
		await recordMessageDeleted(db, message({ statementType: StatementType.paragraph }));
		expect(batchUpdates).toEqual([]);
	});
});

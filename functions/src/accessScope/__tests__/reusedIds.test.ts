import { Collections, QUARANTINED_ACCESS_SCOPE, type Statement } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { quarantineWithChildren, restampIfReused, scopeOfReusedId } from '../recreatedStatements';
import { mayChangeScope, restampOnAccessChange, stampNewStatement } from '../stampAccessScope';
import { runAccessScopeJob } from '../fn_accessScopeJob';
import { fakeStatementStore } from './fakeStatementStore';

const mockDb: { current: Firestore | undefined } = { current: undefined };
jest.mock('../../db', () => ({
	get db() {
		return mockDb.current;
	},
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

const S = Collections.statements;
const read = (store: ReturnType<typeof fakeStatementStore>, id: string) =>
	store.read(S, id) as unknown as Statement;

/** root (open) -> pg (secret) -> q -> a; q was deleted from pg and left a tombstone. */
function world(tombstone: Record<string, unknown> | null) {
	const store = fakeStatementStore();
	mockDb.current = store.db as unknown as Firestore;
	store.seed(S, 'root', {
		statementId: 'root',
		parentId: 'top',
		topParentId: 'root',
		accessScope: 'open',
	});
	store.seed(S, 'pg', {
		statementId: 'pg',
		parentId: 'root',
		topParentId: 'root',
		membership: { access: 'secret' },
		accessScope: 'pg',
	});
	store.seed(S, 'a', { statementId: 'a', parentId: 'q', topParentId: 'root', accessScope: 'pg' });
	if (tombstone)
		store.seed(Collections.statementDeletions, 'q', { statementId: 'q', ...tombstone });

	return store;
}

const madeAgain = (fields: Partial<Statement>) =>
	({ statementId: 'q', creatorId: 'leaver', ...fields }) as Statement;

describe('an id deleted from a private level', () => {
	it('is quarantined when made again at the top, open, with what is filed under it', async () => {
		const store = world({ parentId: 'pg', deletedAtMs: 1, accessScope: 'pg' });
		const again = madeAgain({ parentId: 'top', topParentId: 'q', accessScope: 'open' });
		store.seed(S, 'q', again as unknown as Record<string, unknown>);
		// A re-stamp already loosened the old answer through the new, open q.
		store.seed(S, 'a', {
			statementId: 'a',
			parentId: 'q',
			topParentId: 'root',
			accessScope: 'open',
		});
		store.seed(S, 'a-reply', {
			statementId: 'a-reply',
			parentId: 'a',
			topParentId: 'root',
			accessScope: 'open',
		});

		await stampNewStatement(again);

		for (const id of ['q', 'a', 'a-reply']) {
			expect(read(store, id).accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
		}
		expect(read(store, 'pg').accessScope).toBe('pg');
	});

	it('reads a legacy tombstone by the parent it was deleted from, even once the children were loosened', async () => {
		const store = world({ parentId: 'pg', deletedAtMs: 1 });
		store.seed(S, 'a', {
			statementId: 'a',
			parentId: 'q',
			topParentId: 'root',
			accessScope: 'open',
		});
		const again = madeAgain({ parentId: 'top', topParentId: 'q', accessScope: 'open' });

		await expect(scopeOfReusedId(store.db as unknown as Firestore, again)).resolves.toBe(
			QUARANTINED_ACCESS_SCOPE,
		);
	});

	it('is stamped as usual when made again in the same private level', async () => {
		const store = world({ parentId: 'pg', deletedAtMs: 1, accessScope: 'pg' });
		const again = madeAgain({ parentId: 'pg', topParentId: 'root', accessScope: 'pg' });

		await expect(scopeOfReusedId(store.db as unknown as Firestore, again)).resolves.toBe('pg');
	});

	it('is judged by its old children when the tombstone predates scopes', async () => {
		const store = world({ parentId: 'gone', deletedAtMs: 1 });
		const again = madeAgain({ parentId: 'top', topParentId: 'q', accessScope: 'open' });

		await expect(scopeOfReusedId(store.db as unknown as Firestore, again)).resolves.toBe(
			QUARANTINED_ACCESS_SCOPE,
		);
	});

	it('is left alone when it came from an open space', async () => {
		const store = world({ parentId: 'root', deletedAtMs: 1, accessScope: 'open' });
		store.seed(S, 'a', {
			statementId: 'a',
			parentId: 'q',
			topParentId: 'root',
			accessScope: 'open',
		});
		const again = madeAgain({ parentId: 'top', topParentId: 'q', accessScope: 'open' });

		await expect(scopeOfReusedId(store.db as unknown as Firestore, again)).resolves.toBe('open');
	});

	it('costs no stamp for an id never used before that carries its scope', async () => {
		const store = world(null);
		const fresh = madeAgain({ parentId: 'pg', topParentId: 'root', accessScope: 'pg' });
		store.seed(S, 'q', fresh as unknown as Record<string, unknown>);

		await stampNewStatement(fresh);

		expect(read(store, 'q').accessScope).toBe('pg');
	});

	it('is caught by the delete trigger when it came back before the tombstone', async () => {
		const store = world({ parentId: 'pg', deletedAtMs: 1, accessScope: 'pg' });
		store.seed(S, 'q', {
			statementId: 'q',
			parentId: 'top',
			topParentId: 'q',
			accessScope: 'open',
		});

		await restampIfReused(store.db as unknown as Firestore, 'q');

		expect(read(store, 'q').accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
	});
});

describe('a loop closed in one batch and moved in the next (probe18)', () => {
	const base = { statementId: 'A', parentId: 'C' } as Statement;

	it('counts a change to topParentId or parents alone', () => {
		expect(mayChangeScope(base, { ...base, topParentId: 'root' })).toBe(true);
		expect(mayChangeScope(base, { ...base, parents: ['pg'] })).toBe(true);
		expect(mayChangeScope({ ...base, parents: ['x'] }, { ...base, parents: ['x'] })).toBe(false);
	});

	it('quarantines each member whose tree fields were rewritten', async () => {
		const store = fakeStatementStore();
		mockDb.current = store.db as unknown as Firestore;
		const forged = { topParentId: 'root', parents: ['pg'], accessScope: 'open' };
		store.seed(S, 'A', { statementId: 'A', parentId: 'C', ...forged });
		store.seed(S, 'B', { statementId: 'B', parentId: 'A', ...forged });
		store.seed(S, 'C', { statementId: 'C', parentId: 'B', ...forged });

		for (const id of ['B', 'C']) {
			const after = read(store, id);
			await restampOnAccessChange({ ...after, topParentId: 'A', parents: ['top', 'A'] }, after);
		}

		expect(read(store, 'B').accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
		expect(read(store, 'C').accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
	});

	const queue = (
		store: ReturnType<typeof fakeStatementStore>,
		rootId: string,
		topParentId: string,
	) =>
		store.seed(Collections.accessScopeJobs, rootId, {
			rootId,
			topParentId,
			status: 'pending',
			cursor: null,
			generation: 1,
			updatedAt: 1,
		});

	it('a loop claiming someone else’s top is walked by parentId, not by that whole tree', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'root', {
			statementId: 'root',
			parentId: 'top',
			topParentId: 'root',
			accessScope: 'open',
		});
		// The victim's tree: a job that walked topParentId == root would read it all.
		store.seed(S, 'victim', {
			statementId: 'victim',
			parentId: 'root',
			topParentId: 'root',
			accessScope: 'stale',
		});
		const forged = { topParentId: 'root', parents: ['pg'], accessScope: 'open' };
		store.seed(S, 'A', { statementId: 'A', parentId: 'C', ...forged });
		store.seed(S, 'B', { statementId: 'B', parentId: 'A', ...forged });
		store.seed(S, 'C', { statementId: 'C', parentId: 'B', ...forged });
		store.seed(S, 'reply', { statementId: 'reply', parentId: 'B', ...forged });
		queue(store, 'A', 'A');

		await runAccessScopeJob(store.db as unknown as Firestore, 'A');

		for (const id of ['A', 'B', 'C', 'reply']) {
			expect(read(store, id).accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
		}
		// Untouched: the victim's tree was never walked.
		expect(read(store, 'victim').accessScope).toBe('stale');
		expect(store.read(Collections.accessScopeJobs, 'A')).toMatchObject({
			status: 'done',
			mode: 'subtree',
		});
	});

	it('a root really under its top still has the whole tree re-stamped', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'root', {
			statementId: 'root',
			parentId: 'top',
			topParentId: 'root',
			accessScope: 'open',
		});
		store.seed(S, 'g', {
			statementId: 'g',
			parentId: 'root',
			topParentId: 'root',
			membership: { access: 'secret' },
			accessScope: 'open',
		});
		store.seed(S, 'q', {
			statementId: 'q',
			parentId: 'g',
			topParentId: 'root',
			accessScope: 'open',
		});
		queue(store, 'g', 'root');

		await runAccessScopeJob(store.db as unknown as Firestore, 'g');

		expect(read(store, 'q').accessScope).toBe('g');
		expect(store.read(Collections.accessScopeJobs, 'g')?.mode).toBeUndefined();
	});
});

describe('quarantineWithChildren', () => {
	it('quarantines a subtree, writing nothing already quarantined', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'r', {
			statementId: 'r',
			parentId: 'top',
			topParentId: 'r',
			accessScope: 'open',
		});
		for (let i = 0; i < 35; i++) {
			store.seed(S, `c${i}`, {
				statementId: `c${i}`,
				parentId: 'r',
				topParentId: 'r',
				accessScope: 'open',
			});
		}
		store.seed(S, 'c0-child', {
			statementId: 'c0-child',
			parentId: 'c34',
			topParentId: 'r',
			accessScope: 'open',
		});
		store.seed(S, 'already', {
			statementId: 'already',
			parentId: 'r',
			topParentId: 'r',
			accessScope: QUARANTINED_ACCESS_SCOPE,
		});

		// r, 35 children and one grandchild under the 35th (past one `in` chunk of 30).
		await expect(quarantineWithChildren(store.db as unknown as Firestore, 'r')).resolves.toBe(37);
		expect(read(store, 'c0-child').accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
	});
});

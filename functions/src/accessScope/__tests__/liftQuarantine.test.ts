import { Collections, QUARANTINED_ACCESS_SCOPE, type Statement } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { runLiftQuarantine } from '../../migrations/liftQuarantine';
import { fakeStatementStore } from './fakeStatementStore';

jest.mock('../../db', () => ({ db: {} }));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

const S = Collections.statements;
const Q = QUARANTINED_ACCESS_SCOPE;

/**
 * root (open) -> pg (secret) -> q -> a; also root -> oq (open) -> oa.
 * Everything from q down was quarantined by mistake, and so was oq.
 */
function world() {
	const store = fakeStatementStore();
	const put = (id: string, fields: Record<string, unknown>) =>
		store.seed(S, id, { statementId: id, topParentId: 'root', ...fields });
	put('root', { parentId: 'top', accessScope: 'open' });
	put('pg', { parentId: 'root', membership: { access: 'secret' }, accessScope: 'pg' });
	put('q', { parentId: 'pg', accessScope: Q });
	put('a', { statementType: 'option', parentId: 'q', accessScope: Q });
	put('oq', { parentId: 'root', accessScope: Q });
	put('oa', { statementType: 'option', parentId: 'oq', accessScope: Q });

	return store;
}
const db = (store: ReturnType<typeof fakeStatementStore>) => store.db as unknown as Firestore;
const scopeOf = (store: ReturnType<typeof fakeStatementStore>, id: string) =>
	(store.read(S, id) as unknown as Statement).accessScope;

describe('runLiftQuarantine', () => {
	it('writes nothing on a dry run, and says what it would do', async () => {
		const store = world();
		const result = await runLiftQuarantine(db(store), 'q', { execute: false });

		expect(result.lifted).toEqual([
			{ statementId: 'q', to: 'pg' },
			{ statementId: 'a', to: 'pg' },
		]);
		expect(scopeOf(store, 'q')).toBe(Q);
	});

	it('re-judges each statement from its tree: inside a private level it goes back to that level', async () => {
		const store = world();
		await runLiftQuarantine(db(store), 'q', { execute: true });

		expect(scopeOf(store, 'q')).toBe('pg');
		expect(scopeOf(store, 'a')).toBe('pg');
		// Not under the named root: untouched.
		expect(scopeOf(store, 'oq')).toBe(Q);
	});

	it('opens only what really is open', async () => {
		const store = world();
		await runLiftQuarantine(db(store), 'oq', { execute: true });

		expect(scopeOf(store, 'oq')).toBe('open');
		expect(scopeOf(store, 'oa')).toBe('open');
	});

	it('keeps a statement under a quarantine that is not being lifted', async () => {
		const store = world();
		const result = await runLiftQuarantine(db(store), 'a', { execute: true });

		expect(result.kept).toEqual([{ statementId: 'a', reason: 'under-quarantine' }]);
		expect(scopeOf(store, 'a')).toBe(Q);
	});

	it('keeps a loop, and a statement whose parent was deleted', async () => {
		const store = world();
		store.seed(S, 'L1', { statementId: 'L1', parentId: 'L2', accessScope: Q });
		store.seed(S, 'L2', { statementId: 'L2', parentId: 'L1', accessScope: Q });
		store.seed(S, 'orphan', { statementId: 'orphan', parentId: 'gone', accessScope: Q });

		const loop = await runLiftQuarantine(db(store), 'L1', { execute: true });
		const orphan = await runLiftQuarantine(db(store), 'orphan', { execute: true });

		expect(loop.kept.map(({ reason }) => reason)).toEqual(['loop', 'loop']);
		expect(orphan.kept).toEqual([{ statementId: 'orphan', reason: 'parent-deleted' }]);
		expect(scopeOf(store, 'L1')).toBe(Q);
		expect(scopeOf(store, 'orphan')).toBe(Q);
	});

	it('refuses to write over a re-made private id unless told to', async () => {
		const store = world();
		store.seed(Collections.statementDeletions, 'oq', { statementId: 'oq', accessScope: 'pg' });

		await expect(runLiftQuarantine(db(store), 'oq', { execute: true })).rejects.toThrow(
			/allow-reused-id/,
		);
		expect(scopeOf(store, 'oq')).toBe(Q);

		const result = await runLiftQuarantine(db(store), 'oq', {
			execute: true,
			allowReusedId: true,
		});
		expect(result.rootReusesPrivateId).toBe(true);
		expect(scopeOf(store, 'oq')).toBe('open');
	});

	it('stops at its limit and says so', async () => {
		const store = world();
		const result = await runLiftQuarantine(db(store), 'q', { execute: false, maxStatements: 1 });

		expect(result.truncated).toBe(true);
		expect(result.visited).toBe(1);
	});
});

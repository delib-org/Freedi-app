import { Collections, QUARANTINED_ACCESS_SCOPE, type Statement } from '@freedi/shared-types';
import { AccessScopeLevels, resolveStatementScope } from '../accessScopeLevels';
import { runAccessScopeJob } from '../fn_accessScopeJob';
import { fakeStatementStore } from './fakeStatementStore';

jest.mock('../../db', () => ({ db: {} }));

const S = Collections.statements;
const read = (store: ReturnType<typeof fakeStatementStore>, id: string) =>
	store.read(S, id) as unknown as Statement;

/**
 * A private level `pg` under an open root, and a loop A -> B -> C -> A whose
 * members claim, through `parents` and `topParentId`, to sit inside `pg`.
 */
function loopTree() {
	const store = fakeStatementStore();
	store.seed(S, 'root', { statementId: 'root', parentId: 'top', topParentId: 'root' });
	store.seed(S, 'pg', {
		statementId: 'pg',
		parentId: 'root',
		topParentId: 'root',
		membership: { access: 'secret' },
		accessScope: 'pg',
	});
	const forged = { topParentId: 'root', parents: ['top', 'root', 'pg'], accessScope: 'open' };
	store.seed(S, 'A', { statementId: 'A', parentId: 'B', ...forged });
	store.seed(S, 'B', { statementId: 'B', parentId: 'C', ...forged });
	store.seed(S, 'C', { statementId: 'C', parentId: 'A', ...forged });
	store.seed(S, 'reply', {
		statementId: 'reply',
		statementType: 'option',
		parentId: 'A',
		...forged,
	});
	store.seed(S, 'honest', {
		statementId: 'honest',
		parentId: 'pg',
		topParentId: 'root',
		parents: ['top', 'root', 'pg'],
		accessScope: 'pg',
	});

	return store;
}

describe('loops in the tree', () => {
	it('quarantines a statement that is its own parent', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'S', { statementId: 'S', parentId: 'S', topParentId: 'root' });
		await expect(resolveStatementScope(store.db, read(store, 'S'))).resolves.toBe(
			QUARANTINED_ACCESS_SCOPE,
		);
	});

	it('quarantines every member of a longer loop, and what hangs under it', async () => {
		const store = loopTree();
		const levels = new AccessScopeLevels(store.db);
		const subjects = ['A', 'B', 'C', 'reply'].map((id) => read(store, id));
		await levels.load(subjects);
		for (const subject of subjects) {
			expect(levels.isLoop(subject)).toBe(true);
			expect(levels.scopeOf(subject)).toBe(QUARANTINED_ACCESS_SCOPE);
		}
	});

	it('leaves an honest statement beside the loop alone', async () => {
		const store = loopTree();
		await expect(resolveStatementScope(store.db, read(store, 'honest'))).resolves.toBe('pg');
	});

	it('treats a chain deeper than any real tree as a loop', async () => {
		const store = fakeStatementStore();
		const depth = 60;
		for (let index = 0; index < depth; index += 1) {
			store.seed(S, `n${index}`, {
				statementId: `n${index}`,
				parentId: index === 0 ? 'top' : `n${index - 1}`,
			});
		}
		await expect(resolveStatementScope(store.db, read(store, `n${depth - 1}`))).resolves.toBe(
			QUARANTINED_ACCESS_SCOPE,
		);
	});

	it('the re-stamp job writes the quarantine onto a forged loop', async () => {
		const store = loopTree();
		store.seed(Collections.accessScopeJobs, 'A', {
			rootId: 'A',
			topParentId: 'root',
			status: 'pending',
			cursor: null,
			generation: 1,
			updatedAt: 1,
		});
		await runAccessScopeJob(store.db, 'A');
		for (const id of ['A', 'B', 'C', 'reply']) {
			expect(read(store, id).accessScope).toBe(QUARANTINED_ACCESS_SCOPE);
		}
		expect(read(store, 'honest').accessScope).toBe('pg');
	});
});

import { Collections, type Statement } from '@freedi/shared-types';
import { isAccessScopeOnlyWrite } from '../scopeOnlyWrite';
import { mayChangeScope, restampPlan } from '../stampAccessScope';
import { AccessScopeLevels, governingLevelId, resolveStatementScope } from '../accessScopeLevels';
import { runAccessScopeJob } from '../fn_accessScopeJob';
import {
	BACKFILL_PAGE_SIZE,
	estimateBackfillCost,
	runAccessScopeBackfill,
	TRIGGERS_PER_STATEMENT_WRITE,
} from '../../migrations/backfillAccessScope';
import { fakeStatementStore } from './fakeStatementStore';

jest.mock('../../db', () => ({ db: {} }));

const S = Collections.statements;
const statement = (fields: Partial<Statement> & { statementId: string }) => fields as Statement;

function tree() {
	const store = fakeStatementStore();
	store.seed(S, 'group', {
		statementId: 'group',
		parentId: 'top',
		topParentId: 'group',
		membership: { access: 'secret' },
	});
	store.seed(S, 'q', {
		statementId: 'q',
		parentId: 'group',
		parents: ['group'],
		topParentId: 'group',
	});
	store.seed(S, 'a', {
		statementId: 'a',
		parentId: 'q',
		parents: ['group', 'q'],
		topParentId: 'group',
	});

	return store;
}

describe('isAccessScopeOnlyWrite', () => {
	it('is true when only the scope moved', () => {
		expect(isAccessScopeOnlyWrite({ a: 1 }, { a: 1, accessScope: 'open' })).toBe(true);
		expect(isAccessScopeOnlyWrite({ a: 1, accessScope: 'x' }, { a: 1, accessScope: 'y' })).toBe(
			true,
		);
	});

	it('is false when anything else moved too', () => {
		expect(isAccessScopeOnlyWrite({ a: 1 }, { a: 2, accessScope: 'open' })).toBe(false);
	});

	it('is false when the scope did not move', () => {
		expect(isAccessScopeOnlyWrite({ a: 1, accessScope: 'x' }, { a: 2, accessScope: 'x' })).toBe(
			false,
		);
		expect(isAccessScopeOnlyWrite({ a: 1 }, { a: 1 })).toBe(false);
	});

	it('is false for a create or a delete', () => {
		expect(isAccessScopeOnlyWrite(undefined, { accessScope: 'open' })).toBe(false);
		expect(isAccessScopeOnlyWrite({ accessScope: 'open' }, undefined)).toBe(false);
	});

	it('compares nested data by value', () => {
		const before = { evaluation: { agreement: 1 } };
		const after = { evaluation: { agreement: 1 }, accessScope: 'open' };
		expect(isAccessScopeOnlyWrite(before, after)).toBe(true);
	});
});

describe('mayChangeScope', () => {
	const base = statement({ statementId: 'a', parentId: 'p', accessScope: 'open' });

	it('ignores everyday writes, so they cost no read', () => {
		expect(mayChangeScope(base, { ...base, consensus: 1 })).toBe(false);
	});

	it('ignores its own stamp, so it cannot loop', () => {
		expect(mayChangeScope(base, { ...base, accessScope: 'g' })).toBe(false);
	});

	it('sees an access change, a move, and a lost scope', () => {
		expect(mayChangeScope(base, { ...base, membership: { access: 'secret' } } as Statement)).toBe(
			true,
		);
		expect(mayChangeScope(base, { ...base, parentId: 'other' })).toBe(true);
		expect(mayChangeScope(base, { ...base, accessScope: undefined })).toBe(true);
	});
});

describe('restampPlan', () => {
	const question = (access?: string, accessScope = 'q') =>
		statement({
			statementId: 'q',
			parentId: 'g',
			statementType: 'question',
			accessScope,
			...(access ? { membership: { access } } : {}),
		} as Partial<Statement> & { statementId: string });
	const answer = (access?: string) =>
		statement({
			statementId: 'a',
			parentId: 'q',
			statementType: 'option',
			accessScope: 'q',
			...(access ? { membership: { access } } : {}),
		} as Partial<Statement> & { statementId: string });

	it('queues when the scope moves', () => {
		expect(restampPlan(question('secret'), question('public'), 'open')).toEqual({
			queue: true,
			clearCopiesOf: 'secret',
		});
	});

	it('queues to clear copies when a private setting changes but the scope stays', () => {
		expect(restampPlan(question('secret'), question('moderated'), 'q')).toEqual({
			queue: true,
			clearCopiesOf: 'secret',
		});
	});

	it('does not queue for a cleared copy on an answer', () => {
		expect(restampPlan(answer('secret'), answer(), 'q').queue).toBe(false);
	});

	it('does not queue between two open values with the scope unchanged', () => {
		expect(
			restampPlan(question('openToAll', 'open'), question('public', 'open'), 'open').queue,
		).toBe(false);
	});

	it('does not ask to clear copies of an open setting', () => {
		expect(restampPlan(question('public', 'open'), question('secret', 'open'), 'q')).toEqual({
			queue: true,
			clearCopiesOf: undefined,
		});
	});
});

describe('scope levels', () => {
	it('inherits through a level with no setting', async () => {
		const store = tree();
		const subject = store.read(S, 'a') as unknown as Statement;
		await expect(resolveStatementScope(store.db, subject)).resolves.toBe('group');
	});

	it('reads each ancestor once across a whole page', async () => {
		const store = tree();
		const levels = new AccessScopeLevels(store.db);
		const subjects = ['q', 'a'].map((id) => store.read(S, id) as unknown as Statement);
		await levels.load(subjects);
		await levels.load(subjects);
		expect(levels.readCount).toBe(2);
	});

	it('walks parentId, so a short parents list misses no level', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'top1', { statementId: 'top1', parentId: 'top' });
		store.seed(S, 'mid', {
			statementId: 'mid',
			parentId: 'top1',
			topParentId: 'top1',
			membership: { access: 'secret' },
		});
		store.seed(S, 'q2', {
			statementId: 'q2',
			parentId: 'mid',
			parents: ['top1', 'mid'],
			topParentId: 'top1',
		});
		const chat = statement({
			statementId: 'c',
			parentId: 'q2',
			parents: ['top1', 'q2'],
			topParentId: 'top1',
		});
		await expect(resolveStatementScope(store.db, chat)).resolves.toBe('mid');
	});

	it('stops on a cycle in the parent chain', async () => {
		const store = fakeStatementStore();
		store.seed(S, 'x', { statementId: 'x', parentId: 'y' });
		store.seed(S, 'y', { statementId: 'y', parentId: 'x' });
		await expect(
			resolveStatementScope(store.db, statement({ statementId: 'x', parentId: 'y' })),
		).resolves.toBe('open');
	});

	it('copes with an ancestor that no longer exists', async () => {
		const store = fakeStatementStore();
		const orphan = statement({ statementId: 'o', parentId: 'gone', parents: ['gone'] });
		await expect(resolveStatementScope(store.db, orphan)).resolves.toBe('open');
	});
});

describe('runAccessScopeJob', () => {
	const seedJob = (store: ReturnType<typeof fakeStatementStore>, generation = 1) =>
		store.seed(Collections.accessScopeJobs, 'group', {
			rootId: 'group',
			topParentId: 'group',
			status: 'pending',
			cursor: null,
			generation,
		});

	it('stamps the subtree and finishes', async () => {
		const store = tree();
		seedJob(store);
		await runAccessScopeJob(store.db, 'group');
		expect(store.read(S, 'q')?.accessScope).toBe('group');
		expect(store.read(S, 'a')?.accessScope).toBe('group');
		expect(store.read(Collections.accessScopeJobs, 'group')?.status).toBe('done');
	});

	it('leaves a level with its own setting, and that level’s children, alone', async () => {
		const store = tree();
		store.seed(S, 'q', {
			statementId: 'q',
			parentId: 'group',
			parents: ['group'],
			topParentId: 'group',
			membership: { access: 'public' },
		});
		seedJob(store);
		await runAccessScopeJob(store.db, 'group');
		expect(store.read(S, 'q')?.accessScope).toBe('open');
		expect(store.read(S, 'a')?.accessScope).toBe('open');
	});

	describe('when a private question is opened', () => {
		function openedQuestion() {
			const store = fakeStatementStore();
			store.seed(S, 'q', {
				statementId: 'q',
				parentId: 'top',
				topParentId: 'q',
				statementType: 'question',
				membership: { access: 'public' },
				accessScope: 'open',
			});
			store.seed(S, 'copy', {
				statementId: 'copy',
				parentId: 'q',
				topParentId: 'q',
				statementType: 'option',
				membership: { access: 'secret' },
				accessScope: 'q',
			});
			store.seed(S, 'chat', {
				statementId: 'chat',
				parentId: 'copy',
				topParentId: 'q',
				statementType: 'statement',
				accessScope: 'q',
			});
			store.seed(S, 'sub', {
				statementId: 'sub',
				parentId: 'q',
				topParentId: 'q',
				statementType: 'question',
				membership: { access: 'secret' },
				accessScope: 'sub',
			});
			store.seed(Collections.accessScopeJobs, 'q', {
				rootId: 'q',
				topParentId: 'q',
				clearCopiesOf: 'secret',
				status: 'pending',
				cursor: null,
				generation: 1,
			});

			return store;
		}

		it('clears a copied setting so the answer follows the question', async () => {
			const store = openedQuestion();
			await runAccessScopeJob(store.db, 'q');
			expect(store.read(S, 'copy')?.accessScope).toBe('open');
			expect(store.read(S, 'chat')?.accessScope).toBe('open');
		});

		it('removes only membership.access from the copy', async () => {
			const store = openedQuestion();
			store.seed(S, 'copy', {
				...store.read(S, 'copy'),
				membership: { access: 'secret', adminApproveMembers: true },
			});
			await runAccessScopeJob(store.db, 'q');
			expect(store.read(S, 'copy')?.membership).toEqual({ adminApproveMembers: true });
		});

		it('keeps a real nested question with the same setting private', async () => {
			const store = openedQuestion();
			await runAccessScopeJob(store.db, 'q');
			expect(store.read(S, 'sub')?.accessScope).toBe('sub');
		});
	});

	it('writes nothing the second time', async () => {
		const store = tree();
		seedJob(store);
		await runAccessScopeJob(store.db, 'group');
		const written = store.writes.filter((w) => 'accessScope' in w.patch).length;
		seedJob(store, 2);
		await runAccessScopeJob(store.db, 'group');
		expect(store.writes.filter((w) => 'accessScope' in w.patch).length).toBe(written);
	});

	it('does nothing for a finished job', async () => {
		const store = tree();
		store.seed(Collections.accessScopeJobs, 'group', {
			rootId: 'group',
			status: 'done',
			generation: 1,
		});
		await runAccessScopeJob(store.db, 'group');
		expect(store.writes).toHaveLength(0);
	});

	it('hands over rather than running on, for a very large tree', async () => {
		const store = tree();
		for (let i = 0; i < 4500; i += 1) {
			const id = `c${String(i).padStart(5, '0')}`;
			store.seed(S, id, {
				statementId: id,
				parentId: 'group',
				parents: ['group'],
				topParentId: 'group',
			});
		}
		seedJob(store);
		await runAccessScopeJob(store.db, 'group');
		const job = store.read(Collections.accessScopeJobs, 'group');
		expect(job?.status).toBe('pending');
		expect(job?.cursor).toBeTruthy();
		await runAccessScopeJob(store.db, 'group');
		expect(store.read(Collections.accessScopeJobs, 'group')?.status).toBe('done');
		expect(store.read(S, 'c04499')?.accessScope).toBe('group');
	});
});

describe('governingLevelId', () => {
	it('trusts the stamp', async () => {
		const store = fakeStatementStore();
		const stamped = statement({ statementId: 'k', parentId: 'q', accessScope: 'q' });
		await expect(governingLevelId(store.db, stamped)).resolves.toBe('q');
		expect(store.writes).toHaveLength(0);
	});

	it('is null when stamped open', async () => {
		const store = fakeStatementStore();
		const stamped = statement({ statementId: 'k', parentId: 'q', accessScope: 'open' });
		await expect(governingLevelId(store.db, stamped)).resolves.toBeNull();
	});

	it('walks parentId for a statement not stamped yet', async () => {
		const store = tree();
		const unstamped = store.read(S, 'a') as unknown as Statement;
		await expect(governingLevelId(store.db, unstamped)).resolves.toBe('group');
	});
});

describe('runAccessScopeBackfill', () => {
	it('writes nothing in a dry run', async () => {
		const store = tree();
		const result = await runAccessScopeBackfill(store.db, { execute: false });
		expect(store.writes).toHaveLength(0);
		expect(result).toMatchObject({ scanned: 3, toWrite: 3, restricted: 3, finished: true });
	});

	it('writes only accessScope', async () => {
		const store = tree();
		await runAccessScopeBackfill(store.db, { execute: true });
		expect(store.writes.every((w) => Object.keys(w.patch).join() === 'accessScope')).toBe(true);
		expect(store.read(S, 'a')?.accessScope).toBe('group');
	});

	it('is a no-op the second time', async () => {
		const store = tree();
		await runAccessScopeBackfill(store.db, { execute: true });
		const again = await runAccessScopeBackfill(store.db, { execute: true });
		expect(again).toMatchObject({ toWrite: 0, written: 0, alreadyCorrect: 3 });
	});

	it('does not reinterpret an existing openToAll, and counts it', async () => {
		const store = tree();
		store.seed(S, 'q', {
			statementId: 'q',
			parentId: 'group',
			parents: ['group'],
			membership: { access: 'openToAll' },
		});
		const result = await runAccessScopeBackfill(store.db, { execute: true });
		expect(store.read(S, 'q')?.accessScope).toBe('open');
		expect(result.ownOpenUnderRestricted).toBe(1);
	});

	it('treats a question’s setting copied onto its answer as inherited', async () => {
		const store = tree();
		store.seed(S, 'q', {
			statementId: 'q',
			parentId: 'group',
			parents: ['group'],
			statementType: 'question',
			membership: { access: 'moderated' },
		});
		store.seed(S, 'a', {
			statementId: 'a',
			parentId: 'q',
			parents: ['group', 'q'],
			statementType: 'option',
			membership: { access: 'moderated' },
		});
		await runAccessScopeBackfill(store.db, { execute: true });
		expect(store.read(S, 'a')?.accessScope).toBe('q');
	});

	it('resumes after the cursor', async () => {
		const store = tree();
		const result = await runAccessScopeBackfill(store.db, { execute: true, cursor: 'a' });
		expect(result.scanned).toBe(2);
		expect(store.read(S, 'q')?.accessScope).toBe('group');
		expect(store.read(S, 'a')?.accessScope).toBeUndefined();
	});

	it('stops at the limit, on a page boundary', async () => {
		const store = fakeStatementStore();
		for (let i = 0; i < BACKFILL_PAGE_SIZE + 5; i += 1) {
			store.seed(S, `s${String(i).padStart(4, '0')}`, { parentId: 'top' });
		}
		const result = await runAccessScopeBackfill(store.db, { execute: false, limit: 1 });
		expect(result.scanned).toBe(BACKFILL_PAGE_SIZE);
		expect(result.finished).toBe(false);
	});

	it('throttles between pages', async () => {
		const store = tree();
		const sleep = jest.fn().mockResolvedValue(undefined);
		await runAccessScopeBackfill(store.db, { execute: true, writesPerSecond: 3, sleep });
		expect(sleep).toHaveBeenCalledWith(1000);
	});

	it('prices a full run', () => {
		expect(estimateBackfillCost(1000, 50)).toEqual({
			documents: 1000,
			reads: 1050,
			writes: 1000,
			triggerInvocations: 1000 * TRIGGERS_PER_STATEMENT_WRITE,
		});
	});
});

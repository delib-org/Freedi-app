jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import type { Firestore } from 'firebase-admin/firestore';
import {
	groupAdminTrees,
	isQuestionInScope,
	loadAdminTrees,
	mergeQuestionHits,
	toAdminSubscription,
	type QuestionHit,
	type QuestionScopes,
} from '../questionSearchScopes';

function hit(statementId: string, similarity: number): QuestionHit {
	return { statementId, similarity, mirror: { statementId } };
}

describe('mergeQuestionHits', () => {
	it('keeps the best similarity per question and sorts best first', () => {
		const merged = mergeQuestionHits([
			[hit('a', 0.5), hit('b', 0.9)],
			[hit('a', 0.7), hit('c', 0.6)],
			[],
		]);

		expect(merged.map((h) => [h.statementId, h.similarity])).toEqual([
			['b', 0.9],
			['a', 0.7],
			['c', 0.6],
		]);
	});

	it('breaks ties by id so the order is stable', () => {
		expect(mergeQuestionHits([[hit('z', 0.5), hit('m', 0.5)]]).map((h) => h.statementId)).toEqual([
			'm',
			'z',
		]);
	});
});

describe('toAdminSubscription', () => {
	it('treats a top-level statement as its own whole tree', () => {
		expect(toAdminSubscription({ statementId: 'g1', parentId: 'top', lastUpdate: 5 })).toEqual({
			statementId: 'g1',
			topParentId: 'g1',
			isTop: true,
			lastUpdate: 5,
		});
	});

	it('never lets a bad topParentId on a top-level statement widen the scope', () => {
		expect(
			toAdminSubscription({ statementId: 'g1', parentId: 'top', topParentId: 'other' })
				?.topParentId,
		).toBe('g1');
	});

	it("reads the tree from the statement copy, ignoring the legacy 'top' value", () => {
		expect(
			toAdminSubscription({
				statementId: 's1',
				topParentId: 'top',
				statement: { parentId: 'g1', topParentId: 'g1' },
			}),
		).toMatchObject({ topParentId: 'g1', isTop: false });
	});

	it('skips a nested subscription whose tree is unknown', () => {
		expect(toAdminSubscription({ statementId: 's1', parentId: 'g1' })).toBeNull();
		expect(toAdminSubscription({ parentId: 'top' })).toBeNull();
	});
});

describe('groupAdminTrees', () => {
	it('merges subscriptions per tree, most recent first, capped', () => {
		const trees = groupAdminTrees(
			[
				{ statementId: 'g1', topParentId: 'g1', isTop: true, lastUpdate: 1 },
				{ statementId: 's2', topParentId: 'g2', isTop: false, lastUpdate: 9 },
				{ statementId: 's3', topParentId: 'g2', isTop: false, lastUpdate: 3 },
				{ statementId: 'g3', topParentId: 'g3', isTop: true, lastUpdate: 5 },
			],
			2,
		);

		expect(trees.map((t) => t.topParentId)).toEqual(['g2', 'g3']);
		expect(trees[0].wholeTree).toBe(false);
		expect([...trees[0].roots].sort()).toEqual(['s2', 's3']);
	});
});

describe('isQuestionInScope', () => {
	const scopes: QuestionScopes = {
		uid: 'me',
		trees: [
			{ topParentId: 'g1', wholeTree: true, roots: new Set(), lastUpdate: 1 },
			{ topParentId: 'g2', wholeTree: false, roots: new Set(['s2']), lastUpdate: 1 },
		],
	};

	it.each([
		['my own question anywhere', { statementId: 'x', creatorId: 'me', topParentId: 'g9' }, true],
		[
			'a question in a whole tree I admin',
			{ statementId: 'x', creatorId: 'bob', topParentId: 'g1' },
			true,
		],
		['the admin root itself', { statementId: 's2', creatorId: 'bob', topParentId: 'g2' }, true],
		[
			'under the admin root',
			{ statementId: 'x', creatorId: 'bob', topParentId: 'g2', parents: ['g2', 's2'] },
			true,
		],
		[
			'beside the admin root',
			{ statementId: 'x', creatorId: 'bob', topParentId: 'g2', parents: ['g2'] },
			false,
		],
		['a tree I do not admin', { statementId: 'x', creatorId: 'bob', topParentId: 'g9' }, false],
		[
			'my own hidden question',
			{ statementId: 'x', creatorId: 'me', topParentId: 'g9', hide: true },
			false,
		],
		['no creator and no tree', { statementId: 'x' }, false],
	])('%s → %s', (_label, question, expected) => {
		expect(isQuestionInScope(question, scopes)).toBe(expected);
	});
});

describe('loadAdminTrees', () => {
	function fakeFirestore(ordered: () => Promise<unknown>, unordered: () => Promise<unknown>) {
		const where = jest.fn();
		const query = {
			where,
			select: () => ({
				orderBy: () => ({ limit: () => ({ get: ordered }) }),
				limit: () => ({ get: unordered }),
			}),
		};
		where.mockReturnValue(query);

		return { firestore: { collection: () => query } as unknown as Firestore, where };
	}

	const docs = { docs: [{ data: () => ({ statementId: 'g1', parentId: 'top', lastUpdate: 1 }) }] };

	it('filters by the caller and the admin role', async () => {
		const { firestore, where } = fakeFirestore(
			() => Promise.resolve(docs),
			() => Promise.reject(new Error('unused')),
		);

		const trees = await loadAdminTrees(firestore, 'me');

		expect(where).toHaveBeenCalledWith('userId', '==', 'me');
		expect(where).toHaveBeenCalledWith('role', '==', 'admin');
		expect(trees.map((t) => t.topParentId)).toEqual(['g1']);
	});

	it('falls back to an unordered read while the index is missing', async () => {
		const { firestore } = fakeFirestore(
			() => Promise.reject(Object.assign(new Error('index'), { code: 9 })),
			() => Promise.resolve(docs),
		);

		await expect(loadAdminTrees(firestore, 'me')).resolves.toHaveLength(1);
	});

	it('rethrows any other failure', async () => {
		const { firestore } = fakeFirestore(
			() => Promise.reject(Object.assign(new Error('unavailable'), { code: 14 })),
			() => Promise.resolve(docs),
		);

		await expect(loadAdminTrees(firestore, 'me')).rejects.toThrow('unavailable');
	});
});

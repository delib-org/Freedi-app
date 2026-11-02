import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('../index', () => ({ db: {} }));
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));

import { applyFullExport } from '../fn_fullExport';

interface FakeDoc {
	id: string;
	data: () => Record<string, unknown>;
}

const MAIN = { statementId: 'q', statementType: 'question', creatorId: 'owner', parentId: 'top' };

function child(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		statementId: id,
		parentId: 'q',
		topParentId: 'q',
		statementType: 'option',
		statement: `text ${id}`,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...extra,
	};
}

interface FakeOptions {
	children: Record<string, unknown>[];
	subscriptionRole?: string;
}

/** Minimal Firestore: statements/{id}, statementsSubscribe/{id}, and a paged parentId query. */
function fakeFirestore({ children, subscriptionRole }: FakeOptions): Firestore {
	const docs: FakeDoc[] = children.map((c, i) => ({
		id: String(i).padStart(6, '0'),
		data: () => c,
	}));
	const queryFor = (startIndex: number, size: number): unknown => ({
		startAfter: (last: FakeDoc) => queryFor(docs.findIndex((d) => d.id === last.id) + 1, size),
		limit: (n: number) => queryFor(startIndex, n),
		orderBy: () => queryFor(startIndex, size),
		where: () => queryFor(startIndex, size),
		get: async () => ({ docs: docs.slice(startIndex, startIndex + size) }),
	});

	return {
		collection: (name: string) => ({
			doc: (id: string) => ({
				get: async () => {
					if (name === 'statements') {
						return id === 'q'
							? { exists: true, data: () => MAIN }
							: { exists: false, data: () => undefined };
					}

					return subscriptionRole
						? { exists: true, data: () => ({ role: subscriptionRole }) }
						: { exists: false, data: () => undefined };
				},
			}),
			where: () => queryFor(0, 500),
		}),
	} as unknown as Firestore;
}

describe('applyFullExport', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('rejects unauthenticated callers', async () => {
		await expect(
			applyFullExport(fakeFirestore({ children: [] }), undefined, { statementId: 'q' }),
		).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	it('rejects a user who is neither creator nor admin', async () => {
		await expect(
			applyFullExport(fakeFirestore({ children: [] }), 'stranger', { statementId: 'q' }),
		).rejects.toMatchObject({ code: 'permission-denied' });
		await expect(
			applyFullExport(fakeFirestore({ children: [], subscriptionRole: 'member' }), 'stranger', {
				statementId: 'q',
			}),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('includes hidden children flagged with hide: true', async () => {
		const result = await applyFullExport(
			fakeFirestore({ children: [child('a'), child('b', { hide: true })] }),
			'owner',
			{ statementId: 'q' },
		);

		expect(result.subStatements.map((s) => s.statementId)).toEqual(['a', 'b']);
		expect(result.subStatements[1].hide).toBe(true);
		expect(result.meta).toMatchObject({ total: 2, hiddenCount: 1, skippedEmptyThemes: 0 });
	});

	it('lets a subscription admin export', async () => {
		const result = await applyFullExport(
			fakeFirestore({ children: [child('a')], subscriptionRole: 'admin' }),
			'helper',
			{ statementId: 'q' },
		);

		expect(result.meta.total).toBe(1);
	});

	it('skips and counts empty themes but keeps themes that hold ideas', async () => {
		const result = await applyFullExport(
			fakeFirestore({
				children: [
					child('empty', { isCluster: true, derivedByPipeline: 'topic-cluster' }),
					child('full', {
						isCluster: true,
						derivedByPipeline: 'topic-cluster',
						integratedOptions: ['a'],
					}),
					child('a'),
				],
			}),
			'owner',
			{ statementId: 'q' },
		);

		expect(result.subStatements.map((s) => s.statementId)).toEqual(['full', 'a']);
		expect(result.meta.skippedEmptyThemes).toBe(1);
	});

	it('excludes paragraph and document rows', async () => {
		const result = await applyFullExport(
			fakeFirestore({
				children: [
					child('p', { statementType: 'paragraph' }),
					child('d', { statementType: 'document' }),
					child('a'),
				],
			}),
			'owner',
			{ statementId: 'q' },
		);

		expect(result.subStatements.map((s) => s.statementId)).toEqual(['a']);
	});

	it('pages past 500 children and returns all of them', async () => {
		const many = Array.from({ length: 1203 }, (_, i) => child(`c${i}`));
		const result = await applyFullExport(fakeFirestore({ children: many }), 'owner', {
			statementId: 'q',
		});

		expect(result.subStatements).toHaveLength(1203);
		expect(result.meta.total).toBe(1203);
	});
});

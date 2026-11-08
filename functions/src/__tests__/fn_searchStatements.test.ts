/**
 * searchStatements: auth and validation, the membership gate on tree search,
 * what each scope searches, hide/type filtering, and per-model semantic hits.
 */
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../services/__tests__/helpers/fakeFirestore').firestoreModule,
);

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('firebase-functions/v2/https', () => {
	class HttpsError extends Error {
		constructor(
			readonly code: string,
			message: string,
		) {
			super(message);
		}
	}

	return { HttpsError, onCall: (_options: unknown, handler: unknown) => handler };
});

const mockGenerateEmbedding = jest.fn();
jest.mock('../services/embedding-service', () => ({
	EMBEDDING_DIMENSIONS: 3,
	embeddingService: {
		generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
		cosineSimilarity: jest.fn(),
	},
}));

jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));

import { executeStatementSearch } from '../fn_searchStatements';
import { invalidateEmbeddingModelCache } from '../services/embedding-model-resolver';
import { resetFirestore, seed } from '../services/__tests__/helpers/fakeFirestore';

const SMALL = 'text-embedding-3-small';
const LARGE = 'text-embedding-3-large';

function statement(id: string, data: Record<string, unknown>): void {
	seed('statements', id, { statementId: id, statementType: 'option', lastUpdate: 1, ...data });
}

function subscription(uid: string, statementId: string, data: Record<string, unknown>): void {
	seed('statementsSubscribe', `${uid}--${statementId}`, {
		userId: uid,
		statementId,
		role: 'member',
		lastUpdate: 1,
		...data,
	});
}

function embedding(id: string, topParentId: string, model: string, vector: number[]): void {
	seed('statementEmbeddings', id, {
		statementId: id,
		parentId: topParentId,
		topParentId,
		embeddingModel: model,
		embedding: vector,
	});
}

function seedTree(): void {
	statement('t1', {
		statement: 'City budget',
		statementType: 'question',
		parentId: 'top',
		topParentId: 't1',
		membership: { access: 'secret' },
	});
	statement('o1', {
		statement: 'Talk about parks',
		parentId: 't1',
		topParentId: 't1',
		parents: ['t1'],
	});
	statement('o2', {
		statement: 'Talk behind closed doors',
		parentId: 't1',
		topParentId: 't1',
		parents: ['t1'],
		hide: true,
	});
	statement('p1', {
		statement: 'Talk paragraph',
		statementType: 'paragraph',
		parentId: 'o1',
		topParentId: 't1',
		parents: ['t1', 'o1'],
	});
	statement('o3', {
		statement: 'Green spaces for kids',
		parentId: 't1',
		topParentId: 't1',
		parents: ['t1'],
	});
	statement('o4', { statement: 'Playgrounds', parentId: 't1', topParentId: 't1', parents: ['t1'] });
	statement('x1', {
		statement: 'Talk elsewhere',
		parentId: 't2',
		topParentId: 't2',
		parents: ['t2'],
	});
	statement('x2', { statement: 'Green roofs', parentId: 't2', topParentId: 't2', parents: ['t2'] });
}

async function rejection(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;

		return undefined;
	} catch (error) {
		return (error as { code?: string }).code;
	}
}

beforeEach(() => {
	resetFirestore();
	invalidateEmbeddingModelCache();
	mockGenerateEmbedding.mockReset();
	mockGenerateEmbedding.mockImplementation(
		async (_text: unknown, _context: unknown, options: { model?: string }) => ({
			embedding: options.model === LARGE ? [0, 1, 0] : [1, 0, 0],
			model: options.model,
			dimensions: 3,
		}),
	);
});

describe('request checks', () => {
	it('requires a signed-in caller', async () => {
		expect(
			await rejection(executeStatementSearch(undefined, { scope: { kind: 'home' }, query: 'x' })),
		).toBe('unauthenticated');
	});

	it('rejects a malformed request', async () => {
		expect(
			await rejection(executeStatementSearch('u1', { scope: { kind: 'tree' }, query: 'talk' })),
		).toBe('invalid-argument');
		expect(
			await rejection(
				executeStatementSearch('u1', { scope: { kind: 'everything' }, query: 'talk' }),
			),
		).toBe('invalid-argument');
	});

	it('returns nothing for a query shorter than the minimum', async () => {
		subscription('u1', 't1', {
			parentId: 'top',
			statementType: 'question',
			statement: { statement: 'Talk' },
		});
		const result = await executeStatementSearch('u1', { scope: { kind: 'home' }, query: ' t ' });
		expect(result.lexical).toEqual([]);
	});
});

describe('subscription scopes', () => {
	beforeEach(() => {
		subscription('u1', 't1', {
			parentId: 'top',
			statementType: 'question',
			statement: { statement: 'Talk of the town' },
		});
		subscription('u1', 'o1', {
			parentId: 't1',
			topParentId: 't1',
			statementType: 'option',
			statement: { statement: 'Talk about parks' },
		});
		subscription('u1', 'b1', {
			parentId: 'top',
			role: 'banned',
			statementType: 'question',
			statement: { statement: 'Talk banned' },
		});
		subscription('u1', 'd1', {
			parentId: 'top',
			isDocument: true,
			statementType: 'document',
			statement: { statement: 'Talk document' },
		});
		subscription('u2', 'z1', {
			parentId: 'top',
			statementType: 'question',
			statement: { statement: 'Talk of someone else' },
		});
	});

	it('searches every statement the caller follows, fuzzily', async () => {
		const result = await executeStatementSearch('u1', {
			scope: { kind: 'subscriptions' },
			query: 'tlk',
		});
		expect(result.lexical.map((match) => match.candidate.statementId).sort()).toEqual(['o1', 't1']);
		expect(result.semantic).toEqual([]);
	});

	it('home searches only top-level subscriptions', async () => {
		const result = await executeStatementSearch('u1', { scope: { kind: 'home' }, query: 'talk' });
		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['t1']);
	});
});

describe('tree scope', () => {
	beforeEach(seedTree);

	it('refuses a caller who is neither a member nor in an open space', async () => {
		expect(
			await rejection(
				executeStatementSearch('u1', { scope: { kind: 'tree', rootId: 't1' }, query: 'talk' }),
			),
		).toBe('permission-denied');
	});

	it('refuses a banned caller even in an open space', async () => {
		statement('t1', {
			statement: 'City budget',
			statementType: 'question',
			parentId: 'top',
			membership: { access: 'openToAll' },
		});
		subscription('u1', 't1', { role: 'banned' });
		expect(
			await rejection(
				executeStatementSearch('u1', { scope: { kind: 'tree', rootId: 't1' }, query: 'talk' }),
			),
		).toBe('permission-denied');
	});

	it('refuses an unknown root', async () => {
		subscription('u1', 'nope', {});
		expect(
			await rejection(
				executeStatementSearch('u1', { scope: { kind: 'tree', rootId: 'nope' }, query: 'talk' }),
			),
		).toBe('not-found');
	});

	it('lets a member search the whole tree, skipping hidden statements and paragraphs', async () => {
		subscription('u1', 't1', {});
		const result = await executeStatementSearch('u1', {
			scope: { kind: 'tree', rootId: 't1' },
			query: 'talk',
		});
		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['o1']);
		expect(result.coverage.scanned).toBe(4); // t1, o1, o3, o4
	});

	it('lets anyone search an open space', async () => {
		statement('t1', {
			statement: 'City budget',
			statementType: 'question',
			parentId: 'top',
			membership: { access: 'openToAll' },
		});
		const result = await executeStatementSearch('u9', {
			scope: { kind: 'tree', rootId: 't1' },
			query: 'budget',
		});
		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['t1']);
	});

	it('checks membership on the top statement when searching a subtree', async () => {
		subscription('u1', 't1', {});
		statement('q1', {
			statement: 'Parks question',
			statementType: 'question',
			parentId: 't1',
			topParentId: 't1',
			parents: ['t1'],
		});
		statement('o5', {
			statement: 'Talk in the subtree',
			parentId: 'q1',
			topParentId: 't1',
			parents: ['t1', 'q1'],
		});
		const result = await executeStatementSearch('u1', {
			scope: { kind: 'tree', rootId: 'q1' },
			query: 'talk',
		});
		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['o5']);
	});

	it('adds similar-meaning hits from every embedding model in the tree, without repeating lexical hits', async () => {
		subscription('u1', 't1', {});
		embedding('o1', 't1', SMALL, [1, 0, 0]);
		embedding('o3', 't1', SMALL, [0.9, 0.1, 0]);
		embedding('o4', 't1', LARGE, [0, 1, 0]);
		embedding('o2', 't1', SMALL, [1, 0, 0]); // hidden
		embedding('x2', 't2', SMALL, [1, 0, 0]); // another tree

		const result = await executeStatementSearch('u1', {
			scope: { kind: 'tree', rootId: 't1' },
			query: 'talk',
			semantic: true,
		});

		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['o1']);
		expect(result.semantic.map((match) => match.candidate.statementId).sort()).toEqual([
			'o3',
			'o4',
		]);
		expect(result.semantic.every((match) => match.kind === 'semantic')).toBe(true);
		const models = mockGenerateEmbedding.mock.calls
			.map((call) => (call[2] as { model: string }).model)
			.sort();
		expect(models).toEqual([LARGE, SMALL]);
	});

	it('skips the semantic pass when not asked, or the query is too short', async () => {
		subscription('u1', 't1', {});
		embedding('o3', 't1', SMALL, [1, 0, 0]);

		await executeStatementSearch('u1', { scope: { kind: 'tree', rootId: 't1' }, query: 'talk' });
		await executeStatementSearch('u1', {
			scope: { kind: 'tree', rootId: 't1' },
			query: 'ta',
			semantic: true,
		});

		expect(mockGenerateEmbedding).not.toHaveBeenCalled();
	});

	it('keeps lexical results when the semantic pass fails', async () => {
		subscription('u1', 't1', {});
		embedding('o3', 't1', SMALL, [1, 0, 0]);
		mockGenerateEmbedding.mockRejectedValue(new Error('OpenAI down'));

		const result = await executeStatementSearch('u1', {
			scope: { kind: 'tree', rootId: 't1' },
			query: 'talk',
			semantic: true,
		});

		expect(result.lexical.map((match) => match.candidate.statementId)).toEqual(['o1']);
		expect(result.semantic).toEqual([]);
	});
});

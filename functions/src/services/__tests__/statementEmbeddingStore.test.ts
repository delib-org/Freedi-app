/**
 * Vectors live in `statementEmbeddings/{statementId}`, off the statement doc,
 * so client listeners stop downloading them. These tests pin the contract:
 * every reader finds vectors there, old statement-doc vectors keep working
 * until the migration has run, every write moves them, and the doc follows
 * its statement.
 */
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/fakeFirestore').firestoreModule,
);

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../embedding-service', () => ({
	EMBEDDING_DIMENSIONS: 3,
	embeddingService: { generateEmbedding: jest.fn(), cosineSimilarity: jest.fn() },
}));

import { embeddingCache } from '../embedding-cache-service';
import { invalidateEmbeddingModelCache } from '../embedding-model-resolver';
import { markHybridEmbeddingStale, saveHybridEmbedding } from '../hybrid-vector-service';
import { syncEmbeddingParent, deleteEmbeddingDoc } from '../statement-embedding-store';
import { vectorSearchService } from '../vector-search-service';
import { peek, resetFirestore, seed } from './helpers/fakeFirestore';

const STATEMENTS = 'statements';
const EMBEDDINGS = 'statementEmbeddings';
const v = (...values: number[]) => values;

function statement(id: string, extra: Record<string, unknown> = {}) {
	seed(STATEMENTS, id, { statementId: id, parentId: 'q1', statement: `text ${id}`, ...extra });
}

function embedded(id: string, vector: number[], extra: Record<string, unknown> = {}) {
	seed(EMBEDDINGS, id, { statementId: id, parentId: 'q1', embedding: vector, ...extra });
}

beforeEach(() => {
	resetFirestore();
	invalidateEmbeddingModelCache();
	delete process.env.EMBEDDING_LEGACY_FALLBACK;
});

describe('reading vectors', () => {
	it('reads the vector from statementEmbeddings', async () => {
		statement('a');
		embedded('a', v(1, 0, 0));

		expect(await embeddingCache.getEmbedding('a')).toEqual([1, 0, 0]);
		expect(await embeddingCache.hasEmbedding('a')).toBe(true);
	});

	it('falls back to a vector still stored on the statement doc (pre-migration)', async () => {
		statement('a', { embedding: v(0, 1, 0) });

		expect(await embeddingCache.getEmbedding('a')).toEqual([0, 1, 0]);
		expect(await embeddingCache.hasEmbedding('a')).toBe(true);
	});

	it('ignores statement-doc vectors once the fallback is switched off', async () => {
		process.env.EMBEDDING_LEGACY_FALLBACK = 'off';
		statement('a', { embedding: v(0, 1, 0) });

		expect(await embeddingCache.getEmbedding('a')).toBeNull();
		expect(await embeddingCache.hasEmbedding('a')).toBe(false);
	});

	it('batches across both stores, preferring the embedding doc', async () => {
		statement('new', { embedding: v(9, 9, 9) });
		embedded('new', v(1, 0, 0));
		statement('old', { embedding: v(0, 1, 0) });
		statement('none');

		const got = await embeddingCache.getBatchEmbeddings(['new', 'old', 'none']);

		expect(got.get('new')).toEqual([1, 0, 0]);
		expect(got.get('old')).toEqual([0, 1, 0]);
		expect(got.has('none')).toBe(false);
	});

	it('lists a question’s vectors with their text, skipping hidden statements', async () => {
		statement('a');
		embedded('a', v(1, 0, 0));
		statement('b', { embedding: v(0, 1, 0) });
		statement('hidden', { hide: true });
		embedded('hidden', v(0, 0, 1));
		statement('elsewhere', { parentId: 'q2' });
		embedded('elsewhere', v(1, 1, 1), { parentId: 'q2' });

		const got = await embeddingCache.getEmbeddingsForParent('q1');

		expect(got.map((entry) => entry.statementId).sort()).toEqual(['a', 'b']);
		expect(got.find((entry) => entry.statementId === 'a')?.statement).toBe('text a');
	});

	it('counts coverage from both stores', async () => {
		statement('a');
		embedded('a', v(1, 0, 0), { embeddingCreatedAt: 1 });
		statement('b', { embedding: v(0, 1, 0) });
		statement('c');

		const coverage = await embeddingCache.getEmbeddingCoverage('q1');

		expect(coverage).toMatchObject({ totalStatements: 3, withEmbeddings: 2, withoutEmbeddings: 1 });
	});

	it('reads briefs from the embedding doc, then from a legacy statement doc', async () => {
		embedded('a', v(1, 0, 0), { embeddingBrief: 'brief a' });

		const briefs = await embeddingCache.getBriefs(
			['a', 'b', 'c'],
			new Map([['b', { embeddingBrief: 'legacy brief b' }]]),
		);

		expect(briefs.get('a')).toBe('brief a');
		expect(briefs.get('b')).toBe('legacy brief b');
		expect(briefs.has('c')).toBe(false);
	});
});

describe('writing vectors', () => {
	it('writes the embedding doc with the statement’s parent, hash and brief', async () => {
		statement('a', { parentId: 'q7' });

		await embeddingCache.saveEmbedding('a', v(1, 0, 0), 'context', 'some text', 'a brief');

		const doc = peek(EMBEDDINGS, 'a');
		expect(doc).toMatchObject({
			statementId: 'a',
			parentId: 'q7',
			embeddingContext: 'context',
			embeddingBrief: 'a brief',
		});
		expect(typeof doc?.textHash).toBe('string');
		expect(await embeddingCache.getEmbedding('a')).toEqual([1, 0, 0]);
	});

	it('moves every legacy field off the statement doc, carrying the hybrid vector over', async () => {
		statement('a', {
			embedding: v(0, 1, 0),
			embeddingModel: 'text-embedding-3-small',
			embeddingBrief: 'old brief',
			textHash: 'old',
			hybridEmbedding: v(0, 1, 0, 1),
			hybridEmbeddingStale: true,
		});

		await embeddingCache.saveEmbedding('a', v(1, 0, 0));

		const statementDoc = peek(STATEMENTS, 'a');
		for (const field of [
			'embedding',
			'embeddingModel',
			'embeddingBrief',
			'textHash',
			'hybridEmbedding',
		]) {
			expect(statementDoc).not.toHaveProperty(field);
		}
		expect(statementDoc).toMatchObject({ statement: 'text a' });

		const doc = peek(EMBEDDINGS, 'a');
		expect(doc).toMatchObject({ embeddingBrief: 'old brief', hybridEmbeddingStale: true });
		expect((doc?.hybridEmbedding as { toArray: () => number[] }).toArray()).toEqual([0, 1, 0, 1]);
		expect(await embeddingCache.getEmbedding('a')).toEqual([1, 0, 0]);
	});

	it('refuses to embed a statement that does not exist', async () => {
		await expect(embeddingCache.saveEmbedding('ghost', v(1, 0, 0))).rejects.toThrow();
		expect(peek(EMBEDDINGS, 'ghost')).toBeUndefined();
	});

	it('deletes the vector from both stores', async () => {
		statement('a', { embedding: v(0, 1, 0) });
		embedded('a', v(1, 0, 0));

		await embeddingCache.deleteEmbedding('a');

		expect(peek(EMBEDDINGS, 'a')).not.toHaveProperty('embedding');
		expect(peek(STATEMENTS, 'a')).not.toHaveProperty('embedding');
		expect(await embeddingCache.getEmbedding('a')).toBeNull();
	});

	it('keeps the hybrid vector and its stale flag on the embedding doc, never the statement', async () => {
		statement('a');
		embedded('a', v(1, 0, 0));

		await saveHybridEmbedding('a', v(1, 0, 0, 0));
		await markHybridEmbeddingStale('a');

		expect(peek(EMBEDDINGS, 'a')).toMatchObject({ hybridEmbeddingStale: true });
		expect(peek(STATEMENTS, 'a')).not.toHaveProperty('hybridEmbeddingStale');
	});

	it('marking stale is a quiet no-op for a statement with nothing embedded', async () => {
		statement('a');

		await expect(markHybridEmbeddingStale('a')).resolves.toBeUndefined();
		expect(peek(EMBEDDINGS, 'a')).toBeUndefined();
	});
});

describe('the embedding doc follows its statement', () => {
	it('takes the new parent when the statement moves', async () => {
		embedded('a', v(1, 0, 0), { parentId: 'q1' });

		await syncEmbeddingParent(
			{ statementId: 'a', parentId: 'q1' },
			{ statementId: 'a', parentId: 'q2' },
		);

		expect(peek(EMBEDDINGS, 'a')?.parentId).toBe('q2');
	});

	it('does not create a doc for a statement that was never embedded', async () => {
		await syncEmbeddingParent(
			{ statementId: 'a', parentId: 'q1' },
			{ statementId: 'a', parentId: 'q2' },
		);

		expect(peek(EMBEDDINGS, 'a')).toBeUndefined();
	});

	it('is removed with its statement', async () => {
		embedded('a', v(1, 0, 0));

		await deleteEmbeddingDoc('a');

		expect(peek(EMBEDDINGS, 'a')).toBeUndefined();
	});
});

describe('vector search', () => {
	it('finds neighbours in statementEmbeddings and returns the statements', async () => {
		statement('near');
		embedded('near', v(1, 0.1, 0));
		statement('far');
		embedded('far', v(0, 0, 1));

		const got = await vectorSearchService.findSimilarByEmbedding(v(1, 0, 0), 'q1', {
			threshold: 0.5,
		});

		expect(got.map((hit) => hit.statement.statementId)).toEqual(['near']);
		expect(got[0].statement.statement).toBe('text near');
		expect(got[0].similarity).toBeGreaterThan(0.9);
	});

	it('drops hits whose statement moved away, was deleted, or is hidden', async () => {
		statement('moved', { parentId: 'q2' });
		embedded('moved', v(1, 0, 0), { parentId: 'q1' }); // sync not caught up yet
		embedded('deleted', v(1, 0, 0));
		statement('hidden', { hide: true });
		embedded('hidden', v(1, 0, 0));

		const got = await vectorSearchService.findSimilarByEmbedding(v(1, 0, 0), 'q1', {
			threshold: 0.5,
		});

		expect(got).toEqual([]);
	});

	it('still finds statements whose vector has not been migrated yet, once each', async () => {
		statement('migrated');
		embedded('migrated', v(1, 0, 0));
		statement('legacy', { embedding: v(1, 0.05, 0) });

		const got = await vectorSearchService.findSimilarByEmbedding(v(1, 0, 0), 'q1', {
			threshold: 0.5,
		});

		expect(got.map((hit) => hit.statement.statementId).sort()).toEqual(['legacy', 'migrated']);
	});

	it('searches only statementEmbeddings once the fallback is switched off', async () => {
		process.env.EMBEDDING_LEGACY_FALLBACK = 'off';
		statement('legacy', { embedding: v(1, 0, 0) });

		const got = await vectorSearchService.findSimilarByEmbedding(v(1, 0, 0), 'q1', {
			threshold: 0.5,
		});

		expect(got).toEqual([]);
	});
});

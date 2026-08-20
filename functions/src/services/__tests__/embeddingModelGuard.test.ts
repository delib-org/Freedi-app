/**
 * The guard that makes an embedding-model switch survivable.
 *
 * Vectors from two different embedding models are not comparable, and the
 * failure is silent: the cosine is a real number, nothing throws, the wrong
 * neighbours just rank first. These tests pin the two rules that make the
 * difference between "degrades" and "corrupts".
 */
const docs = new Map<string, Record<string, unknown>>();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => ({
		collection: () => ({
			doc: (id: string) => ({
				get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
			}),
			where: () => ({
				get: async () => ({
					docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })),
				}),
			}),
		}),
	})),
	FieldValue: { vector: jest.fn(), delete: jest.fn() },
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../embedding-service', () => ({
	EMBEDDING_DIMENSIONS: 1536,
	OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
	embeddingService: { generateEmbedding: jest.fn() },
}));

jest.mock('../brief-service', () => ({
	generateBrief: jest.fn(),
	briefEmbeddingsEnabled: jest.fn(() => false),
}));

import { embeddingCache } from '../embedding-cache-service';
import { invalidateEmbeddingModelCache, resolveEmbeddingModel } from '../embedding-model-resolver';

const vector = [0.1, 0.2, 0.3];

beforeEach(() => {
	docs.clear();
	invalidateEmbeddingModelCache();
	jest.clearAllMocks();
});

describe('embedding cache — vectors from another model are not peers', () => {
	it('returns a vector stamped with the active model', async () => {
		docs.set('a', { embedding: vector, embeddingModel: 'text-embedding-3-small' });

		expect(await embeddingCache.getEmbedding('a')).toEqual(vector);
	});

	it('reads a vector from a DIFFERENT model as absent, so it gets regenerated', async () => {
		docs.set('a', { embedding: vector, embeddingModel: 'text-embedding-3-large' });

		// Absent rather than wrong: ensureEmbedding re-embeds it, so a question
		// heals as it is used instead of clustering on a meaningless cosine.
		expect(await embeddingCache.getEmbedding('a')).toBeNull();
	});

	it('treats a MISSING stamp as legacy-compatible, not as stale', async () => {
		// The field predates nothing — vectors written before it existed carry no
		// model. Reading absence as "stale" would re-embed the whole corpus the
		// day this shipped, to fix a problem nobody has yet.
		docs.set('a', { embedding: vector });
		docs.set('b', { embedding: vector, embeddingModel: '' });

		expect(await embeddingCache.getEmbedding('a')).toEqual(vector);
		expect(await embeddingCache.getEmbedding('b')).toEqual(vector);
	});

	it('filters a mixed batch down to the comparable vectors only', async () => {
		docs.set('same', { embedding: vector, embeddingModel: 'text-embedding-3-small' });
		docs.set('legacy', { embedding: vector });
		docs.set('other', { embedding: vector, embeddingModel: 'text-embedding-3-large' });

		const got = await embeddingCache.getBatchEmbeddings(['same', 'legacy', 'other']);

		expect([...got.keys()].sort()).toEqual(['legacy', 'same']);
	});
});

describe('per-question pinned model — the Hebrew migration mechanism', () => {
	const pin = (questionId: string, model: string) =>
		docs.set(questionId, {
			statementSettings: { synthesis: { embeddingModel: model } },
		});

	it('under a pinned question, the PINNED model is the peer and the global one is stale', async () => {
		// This inversion is what makes per-question migration possible at all:
		// without it, a migrated question's 3-large vectors would read as absent
		// forever and the pipeline would re-embed them in a loop.
		pin('q-he', 'text-embedding-3-large');
		docs.set('a', {
			parentId: 'q-he',
			embedding: vector,
			embeddingModel: 'text-embedding-3-large',
		});
		docs.set('b', {
			parentId: 'q-he',
			embedding: vector,
			embeddingModel: 'text-embedding-3-small',
		});

		expect(await embeddingCache.getEmbedding('a')).toEqual(vector);
		expect(await embeddingCache.getEmbedding('b')).toBeNull();
	});

	it('a batch spanning a pinned and an unpinned question judges each doc by ITS question', async () => {
		pin('q-he', 'text-embedding-3-large');
		docs.set('he-ok', {
			parentId: 'q-he',
			embedding: vector,
			embeddingModel: 'text-embedding-3-large',
		});
		docs.set('en-ok', {
			parentId: 'q-en',
			embedding: vector,
			embeddingModel: 'text-embedding-3-small',
		});
		docs.set('he-stale', {
			parentId: 'q-he',
			embedding: vector,
			embeddingModel: 'text-embedding-3-small',
		});

		const got = await embeddingCache.getBatchEmbeddings(['he-ok', 'en-ok', 'he-stale']);

		expect([...got.keys()].sort()).toEqual(['en-ok', 'he-ok']);
	});

	it('an unknown pinned value resolves to the default rather than poisoning the question', async () => {
		pin('q-bad', 'text-embedding-9-imaginary');

		expect(await resolveEmbeddingModel('q-bad')).toBe('text-embedding-3-small');
	});

	it('resolution is cached until invalidated — the migration flow must invalidate', async () => {
		pin('q-he', 'text-embedding-3-small');
		expect(await resolveEmbeddingModel('q-he')).toBe('text-embedding-3-small');

		pin('q-he', 'text-embedding-3-large');
		// Stale until told otherwise…
		expect(await resolveEmbeddingModel('q-he')).toBe('text-embedding-3-small');
		// …which is exactly what reEmbedQuestion does after writing the pin.
		invalidateEmbeddingModelCache('q-he');
		expect(await resolveEmbeddingModel('q-he')).toBe('text-embedding-3-large');
	});
});

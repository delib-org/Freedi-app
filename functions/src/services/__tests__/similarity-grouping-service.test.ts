jest.mock('../embedding-cache-service', () => ({
	embeddingCache: {
		getBatchEmbeddings: jest.fn(),
	},
}));

jest.mock('../vector-search-service', () => ({
	vectorSearchService: {
		findSimilarByEmbedding: jest.fn(),
	},
}));

import { buildCandidateEdges, CandidateEdge } from '../similarity-grouping-service';
import { embeddingCache } from '../embedding-cache-service';
import { vectorSearchService } from '../vector-search-service';

const mockGetBatchEmbeddings = embeddingCache.getBatchEmbeddings as jest.Mock;
const mockFindSimilarByEmbedding = vectorSearchService.findSimilarByEmbedding as jest.Mock;

function fakeStatement(id: string, statement = `text ${id}`) {
	return { statementId: id, statement };
}

function similarResult(id: string, similarity: number) {
	return { statement: fakeStatement(id), similarity };
}

describe('similarity-grouping-service', () => {
	beforeEach(() => {
		mockGetBatchEmbeddings.mockReset();
		mockFindSimilarByEmbedding.mockReset();
	});

	describe('buildCandidateEdges', () => {
		it('returns no edges for empty input without calling Firestore', async () => {
			const edges = await buildCandidateEdges([], { parentId: 'q1' });
			expect(edges).toEqual([]);
			expect(mockGetBatchEmbeddings).not.toHaveBeenCalled();
			expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
		});

		it('emits canonical (a < b) undirected edges deduplicated across queries', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(
				new Map([
					['s1', [0.1, 0.2]],
					['s2', [0.1, 0.2]],
				]),
			);
			// Both s1 and s2 see each other as a top-1 result
			mockFindSimilarByEmbedding.mockImplementation(async (_emb, _pid, _opts) => {
				return [similarResult('s1', 0.95), similarResult('s2', 0.95)];
			});

			const edges = await buildCandidateEdges(['s1', 's2'], {
				parentId: 'q1',
				threshold: 0.9,
				k: 5,
			});

			expect(edges).toHaveLength(1);
			expect(edges[0]).toEqual<CandidateEdge>({ a: 's1', b: 's2', cosine: 0.95 });
		});

		it('drops results below the cosine threshold', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(new Map([['s1', [0.1]]]));
			mockFindSimilarByEmbedding.mockResolvedValue([
				similarResult('s2', 0.95),
				similarResult('s3', 0.75), // below threshold 0.9
			]);

			const edges = await buildCandidateEdges(['s1'], { parentId: 'q1', threshold: 0.9 });

			expect(edges).toEqual([{ a: 's1', b: 's2', cosine: 0.95 }]);
		});

		it('skips self-loops', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(new Map([['s1', [0.1]]]));
			mockFindSimilarByEmbedding.mockResolvedValue([similarResult('s1', 1.0)]);

			const edges = await buildCandidateEdges(['s1'], { parentId: 'q1' });

			expect(edges).toEqual([]);
		});

		it('skips candidates without an embedding', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(new Map([['s1', [0.1]]]));
			mockFindSimilarByEmbedding.mockResolvedValue([similarResult('s2', 0.95)]);

			const edges = await buildCandidateEdges(['s1', 's2-no-emb'], {
				parentId: 'q1',
				threshold: 0.9,
			});

			// Only s1 produced edges; s2-no-emb was skipped silently
			expect(edges).toHaveLength(1);
			expect(mockFindSimilarByEmbedding).toHaveBeenCalledTimes(1);
		});

		it('keeps the higher cosine when the same edge is reported twice', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(
				new Map([
					['s1', [0.1]],
					['s2', [0.2]],
				]),
			);
			let call = 0;
			mockFindSimilarByEmbedding.mockImplementation(async () => {
				call++;

				return call === 1 ? [similarResult('s2', 0.91)] : [similarResult('s1', 0.97)];
			});

			const edges = await buildCandidateEdges(['s1', 's2'], { parentId: 'q1', threshold: 0.9 });

			expect(edges).toEqual([{ a: 's1', b: 's2', cosine: 0.97 }]);
		});

		it('continues processing when one candidate query throws', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(
				new Map([
					['s1', [0.1]],
					['s2', [0.2]],
				]),
			);
			let call = 0;
			mockFindSimilarByEmbedding.mockImplementation(async () => {
				call++;
				if (call === 1) throw new Error('Firestore transient');

				return [similarResult('s1', 0.95)];
			});

			const edges = await buildCandidateEdges(['s1', 's2'], { parentId: 'q1', threshold: 0.9 });

			// s1's call failed, s2's call succeeded and produced edge (s1, s2)
			expect(edges).toEqual([{ a: 's1', b: 's2', cosine: 0.95 }]);
			expect(mockFindSimilarByEmbedding).toHaveBeenCalledTimes(2);
		});

		it('passes threshold and k through to the vector search', async () => {
			mockGetBatchEmbeddings.mockResolvedValue(new Map([['s1', [0.1]]]));
			mockFindSimilarByEmbedding.mockResolvedValue([]);

			await buildCandidateEdges(['s1'], { parentId: 'q1', threshold: 0.85, k: 50 });

			expect(mockFindSimilarByEmbedding).toHaveBeenCalledWith([0.1], 'q1', {
				limit: 50,
				threshold: 0.85,
			});
		});

		it('produces all expected pairwise edges in a small clustered seed', async () => {
			// 3 near-duplicates (s1, s2, s3) cluster together; s4 is an outlier.
			// Mock cosine = 1 - L2(emb_a - emb_b) (toy similarity that respects clusters).
			const embeddings = new Map([
				['s1', [0.1, 0.1]],
				['s2', [0.1, 0.1]],
				['s3', [0.1, 0.1]],
				['s4', [0.9, 0.9]],
			]);
			mockGetBatchEmbeddings.mockResolvedValue(embeddings);
			mockFindSimilarByEmbedding.mockImplementation(
				async (queryEmb: number[], _pid: string, _opts: { threshold: number }) => {
					const results = [];
					for (const [id, emb] of embeddings) {
						const dist = Math.sqrt((queryEmb[0] - emb[0]) ** 2 + (queryEmb[1] - emb[1]) ** 2);
						const sim = 1 - dist; // 1 for identical, low for far
						if (sim >= 0.9) results.push(similarResult(id, sim));
					}

					return results;
				},
			);

			const edges = await buildCandidateEdges(['s1', 's2', 's3', 's4'], {
				parentId: 'q1',
				threshold: 0.9,
			});

			const ids = edges.map((e) => `${e.a}-${e.b}`).sort();
			expect(ids).toEqual(['s1-s2', 's1-s3', 's2-s3']);
			for (const e of edges) {
				expect(e.cosine).toBeGreaterThanOrEqual(0.9);
			}
		});
	});
});

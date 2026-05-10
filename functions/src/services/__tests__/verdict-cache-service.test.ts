/**
 * Tests for the synthesis verdict cache.
 *
 * The wrapper sits on top of `judgeSemanticEquivalence` and short-circuits
 * pairs whose verdict is already persisted. Tests focus on:
 *   - hit/miss branching
 *   - invalidation (modelId / promptVer / textHash mismatch)
 *   - Firestore `in` chunking at the 30-doc limit
 *   - the fallback-result rule (LLM-failure verdicts must NOT be cached)
 *   - read-failure fall-open semantics
 */

const mockDocGet = jest.fn();
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn();
const mockCollectionWhereGet = jest.fn();
const mockWhere = jest.fn(() => ({ get: mockCollectionWhereGet }));
const mockDoc = jest.fn(() => ({ get: mockDocGet }));
const mockCollection = jest.fn(() => ({
	doc: mockDoc,
	where: mockWhere,
}));
const mockBatch = jest.fn(() => ({
	set: mockBatchSet,
	commit: mockBatchCommit,
}));
const mockFirestore = {
	collection: mockCollection,
	batch: mockBatch,
};

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => mockFirestore),
	FieldPath: {
		documentId: jest.fn(() => '__name__'),
	},
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockJudge = jest.fn();
jest.mock('../semantic-equivalence-service', () => {
	const actual = jest.requireActual('../semantic-equivalence-service');

	return {
		...actual,
		judgeSemanticEquivalence: (...args: unknown[]) => mockJudge(...args),
	};
});

import {
	judgeSemanticEquivalenceCached,
	JUDGE_MODEL_ID,
	JUDGE_PROMPT_VER,
} from '../verdict-cache-service';
import { computeTextHash, computePairKey } from '../../synthesis/textHash';
import type { EquivalencePair, EquivalenceResult } from '../semantic-equivalence-service';

function pair(id: string, a: string, b: string): EquivalencePair {
	return { pairId: id, textA: a, textB: b };
}

function fakeSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
	return {
		docs: docs.map((d) => ({
			id: d.id,
			data: () => d.data,
		})),
	};
}

function cacheDoc(
	textA: string,
	textB: string,
	verdict: string,
	overrides: Record<string, unknown> = {},
) {
	const hashA = computeTextHash(textA);
	const hashB = computeTextHash(textB);

	return {
		id: computePairKey(hashA, hashB),
		data: {
			pairKey: computePairKey(hashA, hashB),
			textHashA: hashA,
			textHashB: hashB,
			verdict,
			reason: 'cached',
			modelId: JUDGE_MODEL_ID,
			promptVer: JUDGE_PROMPT_VER,
			createdAt: 1_700_000_000_000,
			...overrides,
		},
	};
}

describe('verdict-cache-service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockBatchCommit.mockResolvedValue(undefined);
	});

	describe('computePairKey', () => {
		it('is symmetric in its inputs', () => {
			const hashA = 'abc123';
			const hashB = 'def456';
			expect(computePairKey(hashA, hashB)).toBe(computePairKey(hashB, hashA));
		});

		it('produces different keys for different content', () => {
			const a1 = computeTextHash('text one');
			const a2 = computeTextHash('text two');
			const b = computeTextHash('text three');
			expect(computePairKey(a1, b)).not.toBe(computePairKey(a2, b));
		});
	});

	describe('judgeSemanticEquivalenceCached', () => {
		it('returns empty without calling cache or judge for empty input', async () => {
			const result = await judgeSemanticEquivalenceCached([]);
			expect(result).toEqual([]);
			expect(mockJudge).not.toHaveBeenCalled();
			expect(mockCollectionWhereGet).not.toHaveBeenCalled();
		});

		it('all-miss: routes every pair to the LLM and writes back to cache', async () => {
			const pairs = [pair('p1', 'A1', 'B1'), pair('p2', 'A2', 'B2')];
			mockCollectionWhereGet.mockResolvedValueOnce(fakeSnapshot([])); // empty cache
			const judgeResults: EquivalenceResult[] = [
				{ pairId: 'p1', verdict: 'same', reason: 'paraphrase' },
				{ pairId: 'p2', verdict: 'related', reason: 'topical' },
			];
			mockJudge.mockResolvedValueOnce(judgeResults);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result).toEqual(judgeResults);
			expect(mockJudge).toHaveBeenCalledTimes(1);
			expect(mockJudge.mock.calls[0][0]).toHaveLength(2);
			expect(mockBatchSet).toHaveBeenCalledTimes(2);
			expect(mockBatchCommit).toHaveBeenCalledTimes(1);
		});

		it('all-hit: returns cached verdicts in input order, no LLM call, no write', async () => {
			const pairs = [pair('p1', 'A1', 'B1'), pair('p2', 'A2', 'B2')];
			mockCollectionWhereGet.mockResolvedValueOnce(
				fakeSnapshot([cacheDoc('A1', 'B1', 'same'), cacheDoc('A2', 'B2', 'related')]),
			);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result.map((r) => r.pairId)).toEqual(['p1', 'p2']);
			expect(result.map((r) => r.verdict)).toEqual(['same', 'related']);
			expect(mockJudge).not.toHaveBeenCalled();
			expect(mockBatchSet).not.toHaveBeenCalled();
			expect(mockBatchCommit).not.toHaveBeenCalled();
		});

		it('mixed: only misses go to LLM; merged in input order', async () => {
			const pairs = [pair('p1', 'A1', 'B1'), pair('p2', 'A2', 'B2'), pair('p3', 'A3', 'B3')];
			mockCollectionWhereGet.mockResolvedValueOnce(
				fakeSnapshot([cacheDoc('A1', 'B1', 'same'), cacheDoc('A3', 'B3', 'different')]),
			);
			mockJudge.mockResolvedValueOnce([{ pairId: 'p2', verdict: 'related', reason: 'topical' }]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result.map((r) => r.pairId)).toEqual(['p1', 'p2', 'p3']);
			expect(result.map((r) => r.verdict)).toEqual(['same', 'related', 'different']);
			expect(mockJudge).toHaveBeenCalledTimes(1);
			expect(mockJudge.mock.calls[0][0]).toHaveLength(1);
			expect(mockJudge.mock.calls[0][0][0].pairId).toBe('p2');
			expect(mockBatchSet).toHaveBeenCalledTimes(1);
		});

		it('invalidates rows with mismatched promptVer (treats as miss)', async () => {
			const pairs = [pair('p1', 'A1', 'B1')];
			mockCollectionWhereGet.mockResolvedValueOnce(
				fakeSnapshot([cacheDoc('A1', 'B1', 'same', { promptVer: 'v0-stale' })]),
			);
			mockJudge.mockResolvedValueOnce([{ pairId: 'p1', verdict: 'related', reason: 'fresh' }]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result[0].verdict).toBe('related');
			expect(mockJudge).toHaveBeenCalledTimes(1);
			expect(mockBatchSet).toHaveBeenCalledTimes(1);
		});

		it('invalidates rows with mismatched modelId (treats as miss)', async () => {
			const pairs = [pair('p1', 'A1', 'B1')];
			mockCollectionWhereGet.mockResolvedValueOnce(
				fakeSnapshot([cacheDoc('A1', 'B1', 'same', { modelId: 'old-model' })]),
			);
			mockJudge.mockResolvedValueOnce([{ pairId: 'p1', verdict: 'different', reason: 'fresh' }]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result[0].verdict).toBe('different');
			expect(mockJudge).toHaveBeenCalledTimes(1);
		});

		it('invalidates rows with mismatched textHash (text edited)', async () => {
			const pairs = [pair('p1', 'A1-edited', 'B1')];
			// Cache row keyed by the OLD pair (A1, B1) — different docId from
			// the lookup key for (A1-edited, B1), so the cache returns nothing.
			mockCollectionWhereGet.mockResolvedValueOnce(fakeSnapshot([]));
			mockJudge.mockResolvedValueOnce([{ pairId: 'p1', verdict: 'same', reason: 'fresh' }]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result[0].verdict).toBe('same');
			expect(mockJudge).toHaveBeenCalledTimes(1);
		});

		it('chunks the Firestore in-query at 30 doc ids', async () => {
			const pairs: EquivalencePair[] = [];
			for (let i = 0; i < 100; i++) {
				pairs.push(pair(`p${i}`, `A${i}`, `B${i}`));
			}
			// Each chunk returns an empty snapshot (all-miss path).
			mockCollectionWhereGet.mockResolvedValue(fakeSnapshot([]));
			mockJudge.mockImplementation((batch: EquivalencePair[]) =>
				Promise.resolve(
					batch.map((p) => ({ pairId: p.pairId, verdict: 'different' as const, reason: 'x' })),
				),
			);

			await judgeSemanticEquivalenceCached(pairs);

			// 100 doc ids / 30 = 4 chunks (30, 30, 30, 10)
			expect(mockCollectionWhereGet).toHaveBeenCalledTimes(4);
		});

		it('does NOT cache fallback results from a failed judge call', async () => {
			const pairs = [pair('p1', 'A1', 'B1'), pair('p2', 'A2', 'B2')];
			mockCollectionWhereGet.mockResolvedValueOnce(fakeSnapshot([]));
			// Mimic the fallback shape produced by judgeSemanticEquivalence on
			// LLM error: verdict 'different' with the canonical reason string.
			mockJudge.mockResolvedValueOnce([
				{ pairId: 'p1', verdict: 'different', reason: 'LLM call failed; defaulting to different' },
				{ pairId: 'p2', verdict: 'different', reason: 'No verdict returned by model' },
			]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result).toHaveLength(2);
			expect(mockBatchSet).not.toHaveBeenCalled();
			expect(mockBatchCommit).not.toHaveBeenCalled();
		});

		it('falls open to the LLM if the cache read throws', async () => {
			const pairs = [pair('p1', 'A1', 'B1')];
			mockCollectionWhereGet.mockRejectedValueOnce(new Error('Firestore unavailable'));
			mockJudge.mockResolvedValueOnce([{ pairId: 'p1', verdict: 'same', reason: 'fallback' }]);

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result[0].verdict).toBe('same');
			expect(mockJudge).toHaveBeenCalledTimes(1);
		});

		it('persistence failure does not break the result', async () => {
			const pairs = [pair('p1', 'A1', 'B1')];
			mockCollectionWhereGet.mockResolvedValueOnce(fakeSnapshot([]));
			mockJudge.mockResolvedValueOnce([{ pairId: 'p1', verdict: 'same', reason: 'fresh' }]);
			mockBatchCommit.mockRejectedValueOnce(new Error('write timeout'));

			const result = await judgeSemanticEquivalenceCached(pairs);

			expect(result[0].verdict).toBe('same');
		});
	});
});

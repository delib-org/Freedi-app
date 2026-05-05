import { refineComponent, pairKey, RefineComponentInput } from '../completeLinkage';
import type {
	EquivalencePair,
	EquivalenceResult,
	EquivalenceVerdict,
} from '../../services/semantic-equivalence-service';

function makeInput(
	memberIds: string[],
	pairVerdicts: Record<string, EquivalenceVerdict>,
	texts?: Record<string, string>,
): RefineComponentInput {
	const verdicts = new Map<string, EquivalenceVerdict>();
	for (const [key, verdict] of Object.entries(pairVerdicts)) {
		const [a, b] = key.split(',');
		verdicts.set(pairKey(a, b), verdict);
	}
	const textMap = new Map<string, string>();
	for (const id of memberIds) {
		textMap.set(id, texts?.[id] ?? id);
	}

	return { memberIds, verdicts, texts: textMap };
}

const noopJudge = jest.fn(async () => [] as EquivalenceResult[]);

describe('refineComponent', () => {
	beforeEach(() => {
		noopJudge.mockClear();
	});

	it('keeps a clique untouched when every internal pair is same', async () => {
		const input = makeInput(['a', 'b', 'c'], {
			'a,b': 'same',
			'a,c': 'same',
			'b,c': 'same',
		});

		const result = await refineComponent(input, noopJudge);

		expect(result.cliques).toEqual([['a', 'b', 'c']]);
		expect(result.singletons).toEqual([]);
		expect(result.newVerdicts).toEqual([]);
		expect(noopJudge).not.toHaveBeenCalled();
	});

	it('splits a chained component when an internal pair is not same', async () => {
		// A~B same, B~C same, A~C different (chaining)
		const input = makeInput(['a', 'b', 'c'], {
			'a,b': 'same',
			'b,c': 'same',
			'a,c': 'different',
		});

		const result = await refineComponent(input, noopJudge);

		expect(result.cliques.length).toBeGreaterThanOrEqual(1);
		// No clique should ever contain a and c together
		for (const clique of result.cliques) {
			expect(clique.includes('a') && clique.includes('c')).toBe(false);
		}
		// Every clique pair must be 'same'
		for (const clique of result.cliques) {
			for (let i = 0; i < clique.length; i++) {
				for (let j = i + 1; j < clique.length; j++) {
					expect(input.verdicts.get(pairKey(clique[i], clique[j]))).toBe('same');
				}
			}
		}
	});

	it('refuses to merge opposites even if cosine put them in one component', async () => {
		// Embedding chain produced {raise, lower}; opposite verdict must split.
		const input = makeInput(['raise', 'lower'], {
			'raise,lower': 'opposite',
		});

		const result = await refineComponent(input, noopJudge);

		expect(result.cliques).toEqual([]);
		expect(result.singletons.sort()).toEqual(['lower', 'raise']);
	});

	it('handles a four-member component split into two pairs', async () => {
		// Sparse sub-graph: {a,b} clique + {c,d} clique, no cross-edges
		const input = makeInput(['a', 'b', 'c', 'd'], {
			'a,b': 'same',
			'c,d': 'same',
			'a,c': 'different',
			'a,d': 'different',
			'b,c': 'different',
			'b,d': 'different',
		});

		const result = await refineComponent(input, noopJudge);

		const sortedCliques = result.cliques
			.map((c) => c.sort())
			.sort((x, y) => x[0].localeCompare(y[0]));
		expect(sortedCliques).toEqual([
			['a', 'b'],
			['c', 'd'],
		]);
	});

	it('returns singletons (no clique) when nothing pairwise-same exists', async () => {
		const input = makeInput(['a', 'b', 'c'], {
			'a,b': 'related',
			'a,c': 'different',
			'b,c': 'opposite',
		});

		const result = await refineComponent(input, noopJudge);

		expect(result.cliques).toEqual([]);
		expect(result.singletons.sort()).toEqual(['a', 'b', 'c']);
	});

	it('fetches missing internal verdicts via the judge callback', async () => {
		// Component has 3 members, only 2 pair verdicts known up front.
		// The third pair (a,c) has no known verdict — must be fetched.
		const input = makeInput(['a', 'b', 'c'], {
			'a,b': 'same',
			'b,c': 'same',
		});

		const judge: jest.Mock<Promise<EquivalenceResult[]>, [EquivalencePair[]]> = jest.fn(
			async (_pairs: EquivalencePair[]) => [
				{ pairId: pairKey('a', 'c'), verdict: 'same' as EquivalenceVerdict, reason: 'fetched' },
			],
		);

		const result = await refineComponent(input, judge);

		expect(judge).toHaveBeenCalledTimes(1);
		const calledPairs = judge.mock.calls[0][0];
		expect(calledPairs).toHaveLength(1);
		expect(calledPairs[0].pairId).toBe(pairKey('a', 'c'));

		expect(result.cliques).toEqual([['a', 'b', 'c']]);
		expect(result.newVerdicts).toEqual([
			{ pairId: pairKey('a', 'c'), verdict: 'same', reason: 'fetched' },
		]);
	});

	it('treats missing-text pairs as different (defensive)', async () => {
		const input = makeInput(['a', 'b', 'c'], {
			'a,b': 'same',
		});
		// Remove text for c so pair (a,c), (b,c) cannot be judged
		input.texts.delete('c');

		const result = await refineComponent(input, noopJudge);

		// (a,c) and (b,c) defaulted to different → c is singleton
		const cliquesContainingC = result.cliques.filter((c) => c.includes('c'));
		expect(cliquesContainingC).toEqual([]);
		expect(result.singletons).toContain('c');
		expect(noopJudge).not.toHaveBeenCalled();
	});

	it('returns no cliques for a component of size < 2', async () => {
		const input = makeInput(['solo'], {});

		const result = await refineComponent(input, noopJudge);

		expect(result.cliques).toEqual([]);
		expect(result.singletons).toEqual(['solo']);
	});

	it('partitions a 5-member chain into the largest valid sub-cliques', async () => {
		// a~b~c clique-of-three; d~e clique-of-two; cross edges all 'related'
		const input = makeInput(['a', 'b', 'c', 'd', 'e'], {
			'a,b': 'same',
			'a,c': 'same',
			'b,c': 'same',
			'd,e': 'same',
			'a,d': 'related',
			'a,e': 'related',
			'b,d': 'related',
			'b,e': 'related',
			'c,d': 'related',
			'c,e': 'related',
		});

		const result = await refineComponent(input, noopJudge);

		const sortedCliques = result.cliques.map((c) => c.sort()).sort((x, y) => y.length - x.length);
		expect(sortedCliques).toEqual([
			['a', 'b', 'c'],
			['d', 'e'],
		]);
	});
});

describe('pairKey', () => {
	it('is order-independent', () => {
		expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
	});

	it('produces a deterministic canonical key', () => {
		expect(pairKey('zebra', 'alpha')).toBe('alpha|zebra');
	});
});

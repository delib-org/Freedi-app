import {
	buildCandidateClusters,
	resolveCandidateThreshold,
	DEFAULT_SYNTH_CANDIDATE_THRESHOLD,
} from '../candidateClusters';
import {
	buildCandidateEdges,
	type CandidateEdge,
} from '../../services/similarity-grouping-service';

jest.mock('../../services/similarity-grouping-service', () => ({
	buildCandidateEdges: jest.fn(),
}));

const mockEdges = buildCandidateEdges as jest.MockedFunction<typeof buildCandidateEdges>;

const edge = (a: string, b: string, cosine = 0.95): CandidateEdge => {
	const [x, y] = a < b ? [a, b] : [b, a];

	return { a: x, b: y, cosine };
};

describe('buildCandidateClusters', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		delete process.env.SYNTHESIS_CANDIDATE_THRESHOLD;
	});

	it('returns no clusters and counts singletons when there are no edges', async () => {
		mockEdges.mockResolvedValue([]);

		const result = await buildCandidateClusters(['a', 'b', 'c'], { parentId: 'q' });

		expect(result.clusters).toEqual([]);
		expect(result.singletonCount).toBe(3);
		expect(result.edgeCount).toBe(0);
	});

	it('forms connected components of size ≥2 and leaves the rest standalone', async () => {
		// a-b-c chain (one component) + d-e pair; f, g standalone.
		mockEdges.mockResolvedValue([edge('a', 'b'), edge('b', 'c'), edge('d', 'e')]);

		const result = await buildCandidateClusters(['a', 'b', 'c', 'd', 'e', 'f', 'g'], {
			parentId: 'q',
		});

		const sorted = result.clusters
			.map((c) => c.memberIds.slice().sort())
			.sort((x, y) => x[0].localeCompare(y[0]));
		expect(sorted).toEqual([
			['a', 'b', 'c'],
			['d', 'e'],
		]);
		expect(result.singletonCount).toBe(2); // f, g
		expect(result.edgeCount).toBe(3);
	});

	it('ignores edges whose endpoints are outside the candidate set', async () => {
		// The vector index is scoped to the parent and may return options not in
		// the working set (filtered-out / hidden). Such edges must not pull in
		// out-of-set ids or merge in-set ids through them.
		mockEdges.mockResolvedValue([
			edge('a', 'b'),
			edge('b', 'OUTSIDE'), // OUTSIDE not in candidateIds
			edge('c', 'OUTSIDE2'),
		]);

		const result = await buildCandidateClusters(['a', 'b', 'c'], { parentId: 'q' });

		expect(result.clusters).toEqual([
			{ clusterId: 'cluster-0', memberIds: expect.arrayContaining(['a', 'b']) },
		]);
		expect(result.clusters[0].memberIds).toHaveLength(2);
		expect(result.singletonCount).toBe(1); // c
		expect(result.edgeCount).toBe(1); // only a-b unioned
	});

	it('returns early without calling the edge builder for < 2 candidates', async () => {
		const result = await buildCandidateClusters(['solo'], { parentId: 'q' });

		expect(mockEdges).not.toHaveBeenCalled();
		expect(result).toEqual({ clusters: [], singletonCount: 1, edgeCount: 0 });
	});

	it('passes the resolved threshold to the edge builder', async () => {
		mockEdges.mockResolvedValue([]);

		await buildCandidateClusters(['a', 'b'], { parentId: 'q', threshold: 0.97 });

		expect(mockEdges).toHaveBeenCalledWith(['a', 'b'], {
			parentId: 'q',
			threshold: 0.97,
			k: undefined,
		});
	});
});

describe('resolveCandidateThreshold', () => {
	afterEach(() => delete process.env.SYNTHESIS_CANDIDATE_THRESHOLD);

	it('defaults when env is unset or invalid', () => {
		expect(resolveCandidateThreshold()).toBe(DEFAULT_SYNTH_CANDIDATE_THRESHOLD);
		process.env.SYNTHESIS_CANDIDATE_THRESHOLD = 'nonsense';
		expect(resolveCandidateThreshold()).toBe(DEFAULT_SYNTH_CANDIDATE_THRESHOLD);
		process.env.SYNTHESIS_CANDIDATE_THRESHOLD = '1.5';
		expect(resolveCandidateThreshold()).toBe(DEFAULT_SYNTH_CANDIDATE_THRESHOLD);
	});

	it('reads a valid env override', () => {
		process.env.SYNTHESIS_CANDIDATE_THRESHOLD = '0.88';
		expect(resolveCandidateThreshold()).toBe(0.88);
	});
});

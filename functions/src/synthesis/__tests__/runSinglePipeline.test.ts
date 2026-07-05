import type { Statement } from '@freedi/shared-types';

// Mock Firebase admin BEFORE importing the SUT.
jest.mock('firebase-admin/firestore', () => {
	const docMock = jest.fn();
	const collectionMock = jest.fn();

	return {
		getFirestore: jest.fn(() => ({ collection: collectionMock })),
		FieldValue: { arrayUnion: jest.fn() },
		__mocks: { docMock, collectionMock },
	};
});

jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock('../../services/embedding-cache-service', () => ({
	embeddingCache: { getBatchEmbeddings: jest.fn() },
}));

jest.mock('../../services/embedding-service', () => ({
	embeddingService: { generateEmbedding: jest.fn() },
}));

const findSimilarMock = jest.fn();
jest.mock('../../services/vector-search-service', () => ({
	vectorSearchService: { findSimilarByEmbedding: findSimilarMock },
}));

const generateProposalMock = jest.fn();
jest.mock('../../services/integration-ai-service', () => ({
	generateSynthesizedProposal: generateProposalMock,
}));

const recordEventMock = jest.fn();
jest.mock('../liveSynth/auditLog', () => ({
	recordLiveSynthEvent: recordEventMock,
}));

const enqueueRecomputeMock = jest.fn();
const findClustersContainingMemberMock = jest.fn();
jest.mock('../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: enqueueRecomputeMock,
	findClustersContainingMember: findClustersContainingMemberMock,
}));

const ensureEmbeddingMock = jest.fn();
jest.mock('../pipeline/embedding', () => ({
	ensureEmbedding: ensureEmbeddingMock,
}));

const debounceCheckMock = jest.fn();
const debounceMarkMock = jest.fn();
jest.mock('../pipeline/debounce', () => ({
	checkAndUpdateSpawnDebounce: debounceCheckMock,
	markSpawnedNow: debounceMarkMock,
	__INTERNAL: { SPAWN_DEBOUNCE_MS: 60_000, DEBOUNCE_COLLECTION: '_liveSynthDebounce' },
}));

const attachMock = jest.fn();
const spawnMock = jest.fn();
const reviewMock = jest.fn();
jest.mock('../pipeline/clusterOps', () => {
	const isCluster = (s: Statement) =>
		Array.isArray(s.integratedOptions) && s.integratedOptions.length > 0;
	const isSynth = (s: Statement) => isCluster(s) && s.derivedByPipeline === 'synthesis';
	const isTopicCluster = (s: Statement) => isCluster(s) && s.derivedByPipeline !== 'synthesis';

	return {
		isCluster,
		isSynth,
		isTopicCluster,
		attachOptionToCluster: attachMock,
		spawnClusterFromPair: spawnMock,
		queueForReview: reviewMock,
	};
});

// Now import the SUT.
import { runSinglePipeline } from '../pipeline/runSinglePipeline';
import { DEFAULT_SYNTHESIS_SETTINGS, MC_DEFAULT_SYNTHESIS_SETTINGS } from '../pipeline/types';
import { embeddingCache } from '../../services/embedding-cache-service';

const getBatchEmbeddingsMock = embeddingCache.getBatchEmbeddings as jest.Mock;

// The option embedding the pipeline sees (from ensureEmbeddingMock) is uniform.
// A vector with alternating ±1 components is orthogonal to it (cosine 0), so it
// stands in for a cluster member that is NOT cohesive with the new option.
const UNIFORM_VEC = Array(1536).fill(0.1);
const ORTHOGONAL_VEC = Array.from({ length: 1536 }, (_, i) => (i % 2 === 0 ? 1 : -1));

function makeOption(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'opt-1',
		statement: 'build more housing',
		parentId: 'q-1',
		statementType: 'option',
		evaluation: { numberOfEvaluators: 5, sumEvaluations: 4 },
		consensus: 0.4,
		...overrides,
	} as unknown as Statement;
}

function makeParent(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q-1',
		statement: 'what should we do?',
		parentId: 'top',
		statementType: 'question',
		statementSettings: {
			synthesis: { ...DEFAULT_SYNTHESIS_SETTINGS, enabled: true },
		},
		...overrides,
	} as unknown as Statement;
}

beforeEach(() => {
	jest.clearAllMocks();
	ensureEmbeddingMock.mockResolvedValue(Array(1536).fill(0.1));
	debounceCheckMock.mockResolvedValue(true);
	attachMock.mockResolvedValue({ attached: true, previousMemberCount: 1, newMemberCount: 2 });
	// Default: the option is not yet a member of any cluster.
	findClustersContainingMemberMock.mockResolvedValue([]);
});

describe('runSinglePipeline', () => {
	describe('cluster-membership idempotence', () => {
		it('skips when the option is already a member of a live cluster (no double-claim)', async () => {
			const option = makeOption();
			findClustersContainingMemberMock.mockResolvedValue([
				{
					statementId: 'cluster-A',
					integratedOptions: ['opt-1'],
					hide: false,
				} as unknown as Statement,
			]);

			const result = await runSinglePipeline({
				option,
				optionId: 'opt-1',
				source: 'synthesizeNow',
			});

			expect(result.action).toBe('skipped');
			expect(result.reason).toContain('already-member-of-cluster:cluster-A');
			// Must not run the attach/spawn passes for an already-owned option.
			expect(findSimilarMock).not.toHaveBeenCalled();
			expect(attachMock).not.toHaveBeenCalled();
			expect(spawnMock).not.toHaveBeenCalled();
		});

		it('proceeds when the option is only owned by a hidden (reverse-integrated) cluster', async () => {
			const option = makeOption();
			const parent = makeParent();
			findClustersContainingMemberMock.mockResolvedValue([
				{
					statementId: 'cluster-dead',
					integratedOptions: ['opt-1'],
					hide: true,
				} as unknown as Statement,
			]);
			findSimilarMock.mockResolvedValue([]);

			const result = await runSinglePipeline({
				option,
				parent,
				optionId: 'opt-1',
				source: 'synthesizeNow',
				forceProcess: true,
			});

			// Not blocked by the dead cluster; falls through to normal processing.
			expect(result.reason).not.toContain('already-member-of-cluster');
			expect(findSimilarMock).toHaveBeenCalled();
		});
	});

	it('skips when synthesis disabled on parent', async () => {
		const option = makeOption();
		const parent = makeParent({
			statementSettings: {
				synthesis: { ...DEFAULT_SYNTHESIS_SETTINGS, enabled: false },
			},
		});
		findSimilarMock.mockResolvedValue([]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('skipped');
		expect(result.reason).toBe('continuous-synthesis-disabled');
		expect(findSimilarMock).not.toHaveBeenCalled();
	});

	it('skips when below minEvaluators (and forceProcess is off)', async () => {
		// Use an explicit higher minEvaluators on the parent so the option's
		// numberOfEvaluators=1 falls under the bar — the global default is now
		// 1, which would let this option through.
		const option = makeOption({
			evaluation: { numberOfEvaluators: 1, sumEvaluations: 1 },
		} as never);
		const parent = makeParent({
			statementSettings: {
				synthesis: { ...DEFAULT_SYNTHESIS_SETTINGS, enabled: true, minEvaluators: 3 },
			},
		} as never);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('skipped');
		expect(result.reason).toBe('below-min-evaluators');
	});

	it('bypasses threshold check when forceProcess is true', async () => {
		const option = makeOption({
			evaluation: { numberOfEvaluators: 0, sumEvaluations: 0 },
		} as never);
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'selective',
			option,
			parent,
			forceProcess: true,
		});
		expect(result.action).toBe('seeded-singleton');
		expect(ensureEmbeddingMock).toHaveBeenCalled();
	});

	it('attaches to an existing SYNTH when top cosine ≥ attachThreshold and target is a synth', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'synth-7',
					integratedOptions: ['opt-a', 'opt-b'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.97,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('attached');
		expect(result.clusterId).toBe('synth-7');
		expect(result.llmCalled).toBe(false);
		expect(attachMock).toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('does NOT attach to a synth when the newcomer is a cohesion outlier (snowball brake)', async () => {
		const option = makeOption();
		const parent = makeParent();
		// High direct cosine to the synth (clears attachThreshold via Stage A)...
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'synth-7',
					integratedOptions: ['opt-a', 'opt-b'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.97,
			},
		]);
		// ...but the new option is orthogonal to every actual member → fails the
		// centroid floor AND the quorum, so the attach must be withheld.
		getBatchEmbeddingsMock.mockResolvedValue(
			new Map([
				['opt-a', ORTHOGONAL_VEC],
				['opt-b', ORTHOGONAL_VEC],
			]),
		);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).not.toBe('attached');
		expect(attachMock).not.toHaveBeenCalled();
	});

	it('attaches to a synth when the newcomer is cohesive with the members', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'synth-7',
					integratedOptions: ['opt-a', 'opt-b'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.97,
			},
		]);
		// Members aligned with the new option → centroid cosine ~1, full quorum.
		getBatchEmbeddingsMock.mockResolvedValue(
			new Map([
				['opt-a', UNIFORM_VEC],
				['opt-b', UNIFORM_VEC],
			]),
		);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('attached');
		expect(result.clusterId).toBe('synth-7');
		expect(attachMock).toHaveBeenCalled();
	});

	it('spawns a SYNTH when LLM agrees (high cosine pair)', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.96,
			},
		]);
		spawnMock.mockResolvedValue({ spawned: true, clusterId: 'cluster-new' });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('spawned');
		expect(result.clusterId).toBe('cluster-new');
		expect(result.llmCalled).toBe(true);
		// Spawn pass always tries 'synth' first; LLM agreed, so single call.
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'synth' }));
	});

	it('spawns a SYNTH when LLM agrees on a paraphrase-territory pair (cosine 0.78)', async () => {
		// Real OpenAI text-embedding-3-small paraphrase cosines land ~0.78,
		// below the strict attachThreshold (0.85). The LLM judge — not cosine
		// — decides whether to spawn a synth in this band.
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'paraphrase-sib', integratedOptions: [] } as unknown as Statement,
				similarity: 0.78,
			},
		]);
		spawnMock.mockResolvedValue({ spawned: true, clusterId: 'synth-from-paraphrases' });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('spawned');
		expect(result.clusterId).toBe('synth-from-paraphrases');
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'synth' }));
	});

	it('prefers existing SYNTH over a higher-cosine plain option (anti-fragmentation)', async () => {
		// Plain option ranks higher by raw cosine, but an existing synth is also
		// in the synth band. The pipeline must attach to the synth, not spawn
		// a competing one from the plain option.
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.93,
			},
			{
				statement: {
					statementId: 'synth-9',
					integratedOptions: ['opt-x', 'opt-y'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.87,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('attached');
		expect(result.clusterId).toBe('synth-9');
		expect(spawnMock).not.toHaveBeenCalled();
		expect(attachMock).toHaveBeenCalled();
	});

	it('falls back to TOPIC CLUSTER when synth LLM refuses (cannotSynthesize)', async () => {
		// LLM judges directional conflict and refuses to synthesize. Instead of
		// queuing for review (old behavior), pipeline retries the spawn in
		// cluster mode (with bypassDebounce=true because the synth attempt
		// already consumed the per-parent debounce window).
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.96,
			},
		]);
		spawnMock
			.mockResolvedValueOnce({ spawned: false, cannotSynthesize: true })
			.mockResolvedValueOnce({ spawned: true, clusterId: 'topic-fallback' });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('spawned');
		expect(result.clusterId).toBe('topic-fallback');
		expect(spawnMock).toHaveBeenCalledTimes(2);
		expect(spawnMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ mode: 'synth' }));
		expect(spawnMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ mode: 'cluster', bypassDebounce: true }),
		);
		expect(reviewMock).not.toHaveBeenCalled();
	});

	it('skips when both synth and cluster fallback fail', async () => {
		const option = makeOption();
		const parent = makeParent();
		// Cosine 0.80 is in the synth-attempt band (≥ synthLowerBound 0.78
		// and < attachThreshold 0.85), which is where the LLM is invited to
		// merge and the cluster fallback applies when it refuses.
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.8,
			},
		]);
		spawnMock
			.mockResolvedValueOnce({ spawned: false, cannotSynthesize: true })
			.mockResolvedValueOnce({ spawned: false });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('skipped');
		expect(result.reason).toBe('cluster-fallback-failed');
		expect(spawnMock).toHaveBeenCalledTimes(2);
	});

	it('attaches to an existing TOPIC CLUSTER when cosine in the cluster band', async () => {
		const option = makeOption();
		const parent = makeParent();
		// cosine 0.7 is between clusterThreshold (0.6) and attachThreshold (0.85)
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'cluster-4',
					integratedOptions: ['opt-c', 'opt-d'],
					derivedByPipeline: 'topic-cluster',
				} as unknown as Statement,
				similarity: 0.7,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('attached');
		expect(result.clusterId).toBe('cluster-4');
		expect(result.llmCalled).toBe(false);
		expect(attachMock).toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('attaches transitively when a candidate plain option is a member of an existing synth (cosine via member)', async () => {
		// Regression for the duplicate-synth bug seen on -x06X-Ew36qS:
		// Synth title cosine to a new paraphrase often drops well below 0.85
		// (LLM-merged titles abstract the proposal), but the original member
		// option's cosine to the new paraphrase stays high. Without
		// transitive evidence, the new paraphrase would spawn yet another
		// synth sharing the member with the existing one.
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'member-paraphrase',
					integratedOptions: [],
				} as unknown as Statement,
				similarity: 0.86,
			},
			{
				statement: {
					statementId: 'existing-synth',
					integratedOptions: ['member-paraphrase', 'founding-paraphrase'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.65,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('attached');
		expect(result.clusterId).toBe('existing-synth');
		expect(result.reason).toContain('via member');
		expect(attachMock).toHaveBeenCalledWith(
			expect.objectContaining({
				cluster: expect.objectContaining({ statementId: 'existing-synth' }),
			}),
		);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('does NOT spawn from a plain option already in a candidate cluster', async () => {
		// Even if no attach pass fires (e.g. all best-evidence below attach
		// threshold), we must not spawn a new synth using a sibling that's
		// already part of an existing cluster — that would just create a
		// duplicate cluster sharing the member.
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				// Sub-attachThreshold plain option, but it's a member of the synth below.
				statement: { statementId: 'shared-member', integratedOptions: [] } as unknown as Statement,
				similarity: 0.74,
			},
			{
				statement: {
					statementId: 'existing-synth-low-cosine',
					integratedOptions: ['shared-member', 'other-member'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.5,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		// No attach (synth best-evidence = 0.74 via shared-member, still
		// below default attachThreshold 0.85). No spawn either, because
		// shared-member is excluded from spawn candidacy.
		expect(result.action).toBe('review-queued');
		expect(spawnMock).not.toHaveBeenCalled();
		expect(attachMock).not.toHaveBeenCalled();
	});

	it('does NOT attach a sub-attachThreshold match to a synth, and spawns from plain option behind it', async () => {
		// Regression: a partly-resembled option at cosine 0.71 must not be
		// absorbed into the existing synth (synth attach requires
		// attachThreshold 0.85). With the band router, cosines in
		// [clusterThreshold, synthLowerBound) route directly to a topic-cluster
		// spawn — skipping the wasted synth attempt that the synth-judge
		// prompt would not refuse for non-conflicting distinct ideas.
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'existing-synth',
					integratedOptions: ['opt-x', 'opt-y'],
					derivedByPipeline: 'synthesis',
				} as unknown as Statement,
				similarity: 0.71,
			},
			{
				statement: { statementId: 'sibling-plain', integratedOptions: [] } as unknown as Statement,
				similarity: 0.7,
			},
		]);
		spawnMock.mockResolvedValueOnce({ spawned: true, clusterId: 'new-topic-cluster' });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('spawned');
		expect(result.clusterId).toBe('new-topic-cluster');
		expect(attachMock).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'cluster',
				sibling: expect.objectContaining({ statementId: 'sibling-plain' }),
			}),
		);
	});

	it('queues for review in the gray band (between reviewLowerBound and clusterThreshold)', async () => {
		const option = makeOption();
		const parent = makeParent();
		// cosine 0.55 is between reviewLowerBound (0.5) and clusterThreshold (0.6)
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.55,
			},
		]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('review-queued');
		expect(result.llmCalled).toBe(false);
		expect(reviewMock).toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('seeds singleton when no neighbors above reviewLowerBound', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('seeded-singleton');
		expect(result.llmCalled).toBe(false);
	});

	it('skips an option that is already in a cluster', async () => {
		const option = makeOption({ integratedOptions: ['some-cluster'] } as never);
		const parent = makeParent();
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('skipped');
		expect(result.reason).toBe('already-clustered');
		expect(ensureEmbeddingMock).not.toHaveBeenCalled();
	});

	it('uses MC defaults when no settings block is present and parent is MC', async () => {
		const option = makeOption();
		const parent = makeParent({
			statementSettings: undefined,
			questionSettings: { questionType: 'mass-consensus' },
		} as never);
		findSimilarMock.mockResolvedValue([]);
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(MC_DEFAULT_SYNTHESIS_SETTINGS.enabled).toBe(true);
		expect(result.action).toBe('seeded-singleton');
	});
});

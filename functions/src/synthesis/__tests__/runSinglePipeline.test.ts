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
jest.mock('../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: enqueueRecomputeMock,
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
	const isSynth = (s: Statement) =>
		isCluster(s) && s.derivedByPipeline === 'synthesis';
	const isTopicCluster = (s: Statement) =>
		isCluster(s) && s.derivedByPipeline !== 'synthesis';

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
});

describe('runSinglePipeline', () => {
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
		expect(spawnMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ mode: 'synth' }),
		);
		expect(spawnMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ mode: 'cluster', bypassDebounce: true }),
		);
		expect(reviewMock).not.toHaveBeenCalled();
	});

	it('skips when both synth and cluster fallback fail', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.7,
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

	it('does NOT attach a sub-attachThreshold match to a synth, and spawns from plain option behind it', async () => {
		// Regression: a partly-resembled option at cosine 0.7 must not be
		// absorbed into the existing synth (synth attach requires
		// attachThreshold 0.85). Under the new LLM-judged spawn, the pipeline
		// hits the plain option behind the synth and asks the LLM whether to
		// synth or cluster.
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
		// Simulate LLM refusal so we land on a topic-cluster fallback —
		// matches the "partly-resembled, different proposal" intent.
		spawnMock
			.mockResolvedValueOnce({ spawned: false, cannotSynthesize: true })
			.mockResolvedValueOnce({ spawned: true, clusterId: 'new-topic-cluster' });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('spawned');
		expect(result.clusterId).toBe('new-topic-cluster');
		expect(attachMock).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				mode: 'synth',
				sibling: expect.objectContaining({ statementId: 'sibling-plain' }),
			}),
		);
		expect(spawnMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ mode: 'cluster', bypassDebounce: true }),
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

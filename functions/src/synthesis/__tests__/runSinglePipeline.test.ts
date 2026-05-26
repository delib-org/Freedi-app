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
jest.mock('../pipeline/clusterOps', () => ({
	isCluster: (s: Statement) => Array.isArray(s.integratedOptions) && s.integratedOptions.length > 0,
	attachOptionToCluster: attachMock,
	spawnClusterFromPair: spawnMock,
	queueForReview: reviewMock,
}));

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
		});
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

	it('attaches to a cluster when top cosine ≥ attachThreshold and target is a cluster', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: {
					statementId: 'cluster-7',
					integratedOptions: ['opt-a', 'opt-b'],
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
		expect(result.clusterId).toBe('cluster-7');
		expect(result.llmCalled).toBe(false);
		expect(attachMock).toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('spawns a cluster when top cosine ≥ attachThreshold and target is a plain option', async () => {
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
	});

	it('queues for review when LLM refuses (cannotSynthesize)', async () => {
		const option = makeOption();
		const parent = makeParent();
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.96,
			},
		]);
		spawnMock.mockResolvedValue({ spawned: false, cannotSynthesize: true });
		const result = await runSinglePipeline({
			optionId: option.statementId,
			source: 'onCreate',
			option,
			parent,
		});
		expect(result.action).toBe('review-queued');
		expect(reviewMock).toHaveBeenCalled();
	});

	it('queues for review in the gray band', async () => {
		const option = makeOption();
		const parent = makeParent();
		// Cosine 0.78 sits between the default reviewLowerBound (0.70) and
		// attachThreshold (0.85), so it routes to admin review without an LLM call.
		findSimilarMock.mockResolvedValue([
			{
				statement: { statementId: 'sibling-3', integratedOptions: [] } as unknown as Statement,
				similarity: 0.78,
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

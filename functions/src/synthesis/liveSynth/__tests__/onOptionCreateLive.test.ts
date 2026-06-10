jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetFirestore = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
	FieldValue: {
		arrayRemove: (...args: unknown[]) => ({ __op: 'arrayRemove', args }),
		arrayUnion: (...args: unknown[]) => ({ __op: 'arrayUnion', args }),
	},
}));

const mockGetBatchEmbeddings = jest.fn();
const mockGenerateEmbedding = jest.fn();
jest.mock('../../../services/embedding-cache-service', () => ({
	embeddingCache: {
		getBatchEmbeddings: (...args: unknown[]) => mockGetBatchEmbeddings(...args),
	},
}));
jest.mock('../../../services/embedding-service', () => ({
	embeddingService: {
		generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
	},
}));

const mockFindSimilarByEmbedding = jest.fn();
jest.mock('../../../services/vector-search-service', () => ({
	vectorSearchService: {
		findSimilarByEmbedding: (...args: unknown[]) => mockFindSimilarByEmbedding(...args),
	},
}));

const mockGenerateSynthesizedProposal = jest.fn();
const mockGenerateTopicLabel = jest.fn();
jest.mock('../../../services/integration-ai-service', () => ({
	generateSynthesizedProposal: (...args: unknown[]) => mockGenerateSynthesizedProposal(...args),
	generateTopicLabel: (...args: unknown[]) => mockGenerateTopicLabel(...args),
}));

const mockEnqueueClusterRecompute = jest.fn();
jest.mock('../clusterRecompute', () => ({
	enqueueClusterRecompute: (...args: unknown[]) => mockEnqueueClusterRecompute(...args),
	findClustersContainingMember: jest.fn().mockResolvedValue([]),
}));

const mockRecordLiveSynthEvent = jest.fn();
jest.mock('../auditLog', () => ({
	recordLiveSynthEvent: (...args: unknown[]) => mockRecordLiveSynthEvent(...args),
}));

import { liveSynthOnOptionCreate } from '../onOptionCreateLive';

/**
 * Decision-tree tests for the live-attach/spawn pipeline. Every external
 * dependency (Firestore, embedding, vector search, proposal LLM, audit
 * log) is mocked. We assert the WRITE pattern, not the result of the
 * underlying physical action.
 */

const ORIGINAL_ENV = process.env.SYNTHESIS_LIVE_SYNTH_ENABLED;

beforeEach(() => {
	mockGetFirestore.mockReset();
	mockGetBatchEmbeddings.mockReset();
	mockGenerateEmbedding.mockReset();
	mockFindSimilarByEmbedding.mockReset();
	mockGenerateSynthesizedProposal.mockReset();
	mockGenerateTopicLabel.mockReset();
	mockEnqueueClusterRecompute.mockReset();
	mockRecordLiveSynthEvent.mockReset();
	process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = 'true';
});

afterAll(() => {
	if (ORIGINAL_ENV === undefined) {
		delete process.env.SYNTHESIS_LIVE_SYNTH_ENABLED;
	} else {
		process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = ORIGINAL_ENV;
	}
});

function makeOption(overrides: Record<string, unknown> = {}): unknown {
	return {
		statementId: 'opt1',
		statement: 'a sample option text long enough to be meaningful',
		statementType: 'option',
		parentId: 'q1',
		topParentId: 'q1',
		creatorId: 'user1',
		creator: { uid: 'user1', displayName: 'User One', email: 'u@x.com' },
		integratedOptions: [],
		// Living-only architecture: synth fires only when an option crosses the
		// engagement threshold (default minEvaluators=3). Tests that exercise
		// the attach/spawn/review paths supply a numberOfEvaluators value that
		// meets the default MC threshold.
		consensus: 0.4,
		evaluation: { numberOfEvaluators: 5, sumEvaluations: 4 },
		...overrides,
	};
}

function setupFirestoreMockForGet(
	options: { exists?: boolean; data?: Record<string, unknown> } = {},
) {
	// Default: parent exists AND is MC so the per-question gate (Ship 3b.5)
	// passes by default. Tests that need a non-MC parent or a missing
	// parent override these explicitly.
	const exists = options.exists ?? true;
	const data = options.data ?? {
		statementId: 'q1',
		statement: 'the question',
		statementType: 'question',
		questionSettings: { questionType: 'mass-consensus' },
	};
	const debounceDoc = {
		get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
		set: jest.fn().mockResolvedValue(undefined),
	};
	const parentDoc = {
		get: jest.fn().mockResolvedValue({
			exists,
			data: () => data,
		}),
	};
	const reviewAdd = jest.fn().mockResolvedValue(undefined);
	const clusterUpdate = jest.fn().mockResolvedValue(undefined);
	const clusterSet = jest.fn().mockResolvedValue(undefined);
	const docMock = jest.fn((id: string) => {
		if (id === 'q1') return parentDoc;

		// debounce / cluster docs reuse the same generic doc handle
		return { ...debounceDoc, update: clusterUpdate, set: clusterSet };
	});
	// Dedup guard (`pairAlreadyClustered`) issues `.where(...).get()` on the
	// statements collection. Default to an empty snapshot so no pre-existing
	// cluster is found and spawn proceeds; tests needing a hit override this.
	const dedupGet = jest.fn().mockResolvedValue({ docs: [] });
	const whereMock = jest.fn(() => ({ get: dedupGet }));
	const collMock = jest.fn((name: string) => {
		if (name === '_liveSynthDebounce') return { doc: docMock };
		if (name === '_liveSynthCandidates') return { add: reviewAdd };

		return { doc: docMock, where: whereMock };
	});
	mockGetFirestore.mockReturnValue({ collection: collMock });

	return {
		debounceDoc,
		parentDoc,
		reviewAdd,
		clusterUpdate,
		clusterSet,
		collMock,
		docMock,
		dedupGet,
		whereMock,
	};
}

describe('liveSynthOnOptionCreate', () => {
	it('exits immediately when the live-synth flag is OFF', async () => {
		process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = 'false';
		await liveSynthOnOptionCreate(makeOption());
		expect(mockGetBatchEmbeddings).not.toHaveBeenCalled();
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('skips non-option statements', async () => {
		await liveSynthOnOptionCreate(makeOption({ statementType: 'question' }));
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('skips options whose parentId is "top"', async () => {
		await liveSynthOnOptionCreate(makeOption({ parentId: 'top' }));
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('skips options that already belong to a cluster', async () => {
		await liveSynthOnOptionCreate(makeOption({ integratedOptions: ['some-existing-cluster'] }));
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('skips when optedOutOfMerge === false (foreground will handle)', async () => {
		await liveSynthOnOptionCreate(makeOption({ optedOutOfMerge: false }));
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('attaches when top hit is a cluster at cosine ≥ 0.92', async () => {
		setupFirestoreMockForGet();
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'cluster1',
					statement: 'cluster title',
					integratedOptions: ['x1', 'x2'],
					parentId: 'q1',
				},
				similarity: 0.95,
			},
		]);

		await liveSynthOnOptionCreate(makeOption());

		expect(mockEnqueueClusterRecompute).toHaveBeenCalledWith(
			'cluster1',
			'pipeline:onCreate:attach',
			'user1',
		);
		const auditCalls = mockRecordLiveSynthEvent.mock.calls;
		const attachCall = auditCalls.find((c) => c[0]?.action === 'attach');
		expect(attachCall).toBeDefined();
		expect(attachCall?.[0]).toMatchObject({ clusterId: 'cluster1', optionId: 'opt1' });
		expect(mockGenerateSynthesizedProposal).not.toHaveBeenCalled();
	});

	it('spawns a new cluster when top hit is a plain option at cosine ≥ 0.92', async () => {
		const fs = setupFirestoreMockForGet({
			exists: true,
			data: {
				statementId: 'q1',
				statement: 'the question',
				statementType: 'question',
				questionSettings: { questionType: 'mass-consensus' },
			},
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'sibling-opt',
					statement: 'sibling option text',
					integratedOptions: [], // plain option, NOT a cluster
					statementType: 'option',
					parentId: 'q1',
				},
				similarity: 0.93,
			},
		]);
		mockGenerateSynthesizedProposal.mockResolvedValue({
			title: 'Synthesized title',
			description: 'merged description',
			paragraphs: [],
		});

		await liveSynthOnOptionCreate(makeOption());

		expect(mockGenerateSynthesizedProposal).toHaveBeenCalledTimes(1);
		expect(fs.parentDoc.get).toHaveBeenCalled();
		const spawnAudit = mockRecordLiveSynthEvent.mock.calls.find((c) => c[0]?.action === 'spawn');
		expect(spawnAudit).toBeDefined();
		expect(mockEnqueueClusterRecompute).toHaveBeenCalledWith(
			expect.any(String),
			'pipeline:onCreate:spawn',
			'user1',
		);
	});

	it('does NOT spawn a duplicate when the sibling is already in a visible cluster (dedup)', async () => {
		const fs = setupFirestoreMockForGet();
		// The dedup guard finds an existing visible cluster containing the sibling.
		fs.dedupGet.mockResolvedValue({
			docs: [
				{
					data: () => ({
						statementId: 'existing-cluster',
						isCluster: true,
						hide: false,
						parentId: 'q1',
						integratedOptions: ['sibling-opt', 'someone-else'],
					}),
				},
			],
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'sibling-opt',
					statement: 'sibling option text',
					integratedOptions: [], // looks like a plain option to the caller
					statementType: 'option',
					parentId: 'q1',
				},
				similarity: 0.93,
			},
		]);

		await liveSynthOnOptionCreate(makeOption());

		// No proposal generated and no spawn — the pair was already covered.
		expect(mockGenerateSynthesizedProposal).not.toHaveBeenCalled();
		const spawnAudit = mockRecordLiveSynthEvent.mock.calls.find((c) => c[0]?.action === 'spawn');
		expect(spawnAudit).toBeUndefined();
	});

	it('queues for review when top hit is in the gray band [reviewLowerBound, clusterThreshold) — no LLM call', async () => {
		const fs = setupFirestoreMockForGet();
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		// Cosine 0.55 sits between the default reviewLowerBound (0.5) and
		// clusterThreshold (0.6), so it routes to admin review without any LLM call.
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'sibling-opt',
					statement: 'sibling text',
					integratedOptions: [],
					parentId: 'q1',
				},
				similarity: 0.55,
			},
		]);

		await liveSynthOnOptionCreate(makeOption());

		expect(mockGenerateSynthesizedProposal).not.toHaveBeenCalled();
		expect(fs.reviewAdd).toHaveBeenCalledTimes(1);
		const reviewAudit = mockRecordLiveSynthEvent.mock.calls.find(
			(c) => c[0]?.action === 'review-queued',
		);
		expect(reviewAudit).toBeDefined();
	});

	it('takes no action when no neighbors match', async () => {
		setupFirestoreMockForGet();
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([]);

		await liveSynthOnOptionCreate(makeOption());

		expect(mockGenerateSynthesizedProposal).not.toHaveBeenCalled();
		expect(mockEnqueueClusterRecompute).not.toHaveBeenCalled();
		expect(mockRecordLiveSynthEvent).not.toHaveBeenCalled();
	});

	it('falls back to topic-cluster spawn when synth LLM proposes cannotSynthesize=true', async () => {
		// New behavior: when generateSynthesizedProposal refuses (directional
		// conflict, etc.), the pipeline retries the spawn in cluster mode
		// (generateTopicLabel) instead of queuing for review.
		setupFirestoreMockForGet({
			exists: true,
			data: {
				statementId: 'q1',
				statement: 'the question',
				questionSettings: { questionType: 'mass-consensus' },
			},
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'opposing-opt',
					statement: 'opposing direction text',
					integratedOptions: [],
					parentId: 'q1',
				},
				similarity: 0.93,
			},
		]);
		mockGenerateSynthesizedProposal.mockResolvedValue({
			title: '',
			description: '',
			paragraphs: [],
			cannotSynthesize: true,
			reason: 'opposing directions',
		});
		mockGenerateTopicLabel.mockResolvedValue({
			title: 'Park Plans',
			description: 'Approaches to using the downtown parking lot.',
		});

		await liveSynthOnOptionCreate(makeOption());

		expect(mockGenerateSynthesizedProposal).toHaveBeenCalledTimes(1);
		expect(mockGenerateTopicLabel).toHaveBeenCalledTimes(1);
		const spawnAudit = mockRecordLiveSynthEvent.mock.calls.find(
			(c) => c[0]?.action === 'spawn' && c[0]?.newState?.mode === 'cluster',
		);
		expect(spawnAudit).toBeDefined();
		expect(mockEnqueueClusterRecompute).toHaveBeenCalledWith(
			expect.any(String),
			'pipeline:onCreate:spawn',
			'user1',
		);
	});

	it('Ship 3b.5: gates OFF when parent is non-MC and has no override', async () => {
		setupFirestoreMockForGet({
			exists: true,
			data: { statementId: 'q1', statement: 'q', statementType: 'question' },
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		await liveSynthOnOptionCreate(makeOption());
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('Ship 3b.5: gates ON when parent is non-MC but has explicit liveSynthEnabled=true override', async () => {
		setupFirestoreMockForGet({
			exists: true,
			data: {
				statementId: 'q1',
				statement: 'q',
				statementType: 'question',
				statementSettings: { liveSynthEnabled: true },
			},
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([]);
		await liveSynthOnOptionCreate(makeOption());
		expect(mockFindSimilarByEmbedding).toHaveBeenCalled();
	});

	it('Ship 3b.5: gates OFF when MC parent has explicit liveSynthEnabled=false override', async () => {
		setupFirestoreMockForGet({
			exists: true,
			data: {
				statementId: 'q1',
				statement: 'q',
				statementType: 'question',
				questionSettings: { questionType: 'mass-consensus' },
				statementSettings: { liveSynthEnabled: false },
			},
		});
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		await liveSynthOnOptionCreate(makeOption());
		expect(mockFindSimilarByEmbedding).not.toHaveBeenCalled();
	});

	it('falls back to direct embedding generation when cache is empty', async () => {
		setupFirestoreMockForGet();
		mockGetBatchEmbeddings.mockResolvedValue(new Map());
		mockGenerateEmbedding.mockResolvedValue({ embedding: [0.5, 0.5, 0.5] });
		mockFindSimilarByEmbedding.mockResolvedValue([]);

		await liveSynthOnOptionCreate(makeOption());

		expect(mockGenerateEmbedding).toHaveBeenCalled();
		expect(mockFindSimilarByEmbedding).toHaveBeenCalled();
	}, 10000); // ensureEmbedding has a 5s wait loop; bump test timeout
});

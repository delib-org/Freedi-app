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
jest.mock('../../../services/integration-ai-service', () => ({
	generateSynthesizedProposal: (...args: unknown[]) => mockGenerateSynthesizedProposal(...args),
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
		consensus: 0,
		evaluation: { numberOfEvaluators: 0, sumEvaluations: 0 },
		...overrides,
	};
}

function setupFirestoreMockForGet(
	options: { exists: boolean; data?: Record<string, unknown> } = { exists: false },
) {
	const debounceDoc = {
		get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
		set: jest.fn().mockResolvedValue(undefined),
	};
	const parentDoc = {
		get: jest.fn().mockResolvedValue({
			exists: options.exists,
			data: () => options.data ?? {},
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
	const collMock = jest.fn((name: string) => {
		if (name === '_liveSynthDebounce') return { doc: docMock };
		if (name === '_liveSynthCandidates') return { add: reviewAdd };

		return { doc: docMock };
	});
	mockGetFirestore.mockReturnValue({ collection: collMock });

	return { debounceDoc, parentDoc, reviewAdd, clusterUpdate, clusterSet, collMock, docMock };
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
			'liveSynth:attach',
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
			data: { statementId: 'q1', statement: 'the question', statementType: 'question' },
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
			'liveSynth:spawn',
			'user1',
		);
	});

	it('queues for review when top hit is in [0.85, 0.92) — no LLM call', async () => {
		const fs = setupFirestoreMockForGet();
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0.5, 0.5, 0.5]]]));
		mockFindSimilarByEmbedding.mockResolvedValue([
			{
				statement: {
					statementId: 'sibling-opt',
					statement: 'sibling text',
					integratedOptions: [],
					parentId: 'q1',
				},
				similarity: 0.88,
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

	it('does NOT spawn when LLM proposes cannotSynthesize=true (queues for review instead)', async () => {
		const fs = setupFirestoreMockForGet({
			exists: true,
			data: { statementId: 'q1', statement: 'the question' },
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

		await liveSynthOnOptionCreate(makeOption());

		// LLM was called (we did try) — but no cluster was written.
		expect(mockGenerateSynthesizedProposal).toHaveBeenCalledTimes(1);
		expect(fs.reviewAdd).toHaveBeenCalledTimes(1);
		const reviewAudit = mockRecordLiveSynthEvent.mock.calls.find(
			(c) => c[0]?.action === 'review-queued',
		);
		expect(reviewAudit).toBeDefined();
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

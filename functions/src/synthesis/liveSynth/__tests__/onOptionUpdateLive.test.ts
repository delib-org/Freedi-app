jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetFirestore = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
	FieldValue: {
		arrayRemove: (...args: unknown[]) => ({ __op: 'arrayRemove', args }),
	},
}));

const mockGenerateEmbedding = jest.fn();
const mockGetBatchEmbeddings = jest.fn();
const mockSaveEmbedding = jest.fn();
jest.mock('../../../services/embedding-service', () => ({
	embeddingService: {
		generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
	},
}));
jest.mock('../../../services/embedding-cache-service', () => ({
	embeddingCache: {
		getBatchEmbeddings: (...args: unknown[]) => mockGetBatchEmbeddings(...args),
		saveEmbedding: (...args: unknown[]) => mockSaveEmbedding(...args),
	},
}));

const mockJudgeCached = jest.fn();
jest.mock('../../../services/verdict-cache-service', () => ({
	judgeSemanticEquivalenceCached: (...args: unknown[]) => mockJudgeCached(...args),
}));

const mockFindClustersContainingMember = jest.fn();
const mockEnqueueClusterRecompute = jest.fn();
jest.mock('../clusterRecompute', () => ({
	enqueueClusterRecompute: (...args: unknown[]) => mockEnqueueClusterRecompute(...args),
	findClustersContainingMember: (...args: unknown[]) => mockFindClustersContainingMember(...args),
}));

const mockRecordLiveSynthEvent = jest.fn();
jest.mock('../auditLog', () => ({
	recordLiveSynthEvent: (...args: unknown[]) => mockRecordLiveSynthEvent(...args),
}));

import {
	liveSynthOnOptionUpdate,
	diffEditEvent,
	detectBecameOption,
	__INTERNAL,
} from '../onOptionUpdateLive';

const ORIGINAL_ENV = process.env.SYNTHESIS_LIVE_SYNTH_ENABLED;

beforeEach(() => {
	mockGetFirestore.mockReset();
	mockGenerateEmbedding.mockReset();
	mockGetBatchEmbeddings.mockReset();
	mockSaveEmbedding.mockReset();
	mockJudgeCached.mockReset();
	mockFindClustersContainingMember.mockReset();
	mockEnqueueClusterRecompute.mockReset();
	mockRecordLiveSynthEvent.mockReset();
	process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = 'true';
	mockSaveEmbedding.mockResolvedValue(undefined);
});

afterAll(() => {
	if (ORIGINAL_ENV === undefined) {
		delete process.env.SYNTHESIS_LIVE_SYNTH_ENABLED;
	} else {
		process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = ORIGINAL_ENV;
	}
});

function makeBeforeAfter(
	before: Partial<{
		statement: string;
		statementType: string;
		statementId: string;
		parentId: string;
	}>,
	after: Partial<{
		statement: string;
		statementType: string;
		statementId: string;
		parentId: string;
	}>,
) {
	const baseBefore = {
		statementId: 'opt1',
		statement: 'original text long enough',
		statementType: 'option',
		parentId: 'q1',
		...before,
	};
	const baseAfter = {
		statementId: 'opt1',
		statement: 'changed text long enough',
		statementType: 'option',
		parentId: 'q1',
		...after,
	};

	return [baseBefore, baseAfter] as const;
}

function setupFirestore(options: { mcParent?: boolean } = {}) {
	const updateMock = jest.fn().mockResolvedValue(undefined);
	const deleteMock = jest.fn().mockResolvedValue(undefined);
	const evalsGet = jest.fn().mockResolvedValue({ empty: true, docs: [] });
	const archiveSet = jest.fn();
	const batch = {
		set: archiveSet,
		commit: jest.fn().mockResolvedValue(undefined),
	};
	// The trigger now fetches the parent question first (for the Ship 3b.5
	// per-question gate). Default to an MC parent so the gate passes; tests
	// that want to assert "gate-blocks" set mcParent: false.
	const isMc = options.mcParent ?? true;
	const parentGet = jest.fn().mockResolvedValue({
		exists: true,
		data: () => ({
			statementId: 'q1',
			statementType: 'question',
			questionSettings: isMc ? { questionType: 'mass-consensus' } : {},
		}),
	});
	const docMock = jest.fn((id: string) => {
		if (id === 'q1') {
			return {
				get: parentGet,
				update: updateMock,
				delete: deleteMock,
				set: jest.fn().mockResolvedValue(undefined),
			};
		}

		return {
			get: parentGet,
			update: updateMock,
			delete: deleteMock,
			set: jest.fn().mockResolvedValue(undefined),
		};
	});
	const whereMock = jest.fn().mockReturnValue({ get: evalsGet });
	const collMock = jest.fn().mockReturnValue({ doc: docMock, where: whereMock });
	mockGetFirestore.mockReturnValue({
		collection: collMock,
		batch: () => batch,
	});

	return { updateMock, deleteMock, evalsGet, batch, docMock, collMock, archiveSet, parentGet };
}

describe('detectBecameOption', () => {
	it('returns the after-Statement when statementType promoted to option', () => {
		const result = detectBecameOption(
			{ statementId: 's1', parentId: 'p', statementType: 'statement', statement: 'a' },
			{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
		);
		expect(result).toMatchObject({ statementId: 's1', statementType: 'option' });
	});
	it('returns null when both before and after are option', () => {
		expect(
			detectBecameOption(
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'b' },
			),
		).toBeNull();
	});
	it('returns null when after is not an option', () => {
		expect(
			detectBecameOption(
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
				{ statementId: 's1', parentId: 'p', statementType: 'question', statement: 'a' },
			),
		).toBeNull();
	});
	it('returns null when parent is missing or "top"', () => {
		expect(
			detectBecameOption(
				{ statementType: 'statement' },
				{ statementId: 's1', parentId: 'top', statementType: 'option', statement: 'a' },
			),
		).toBeNull();
	});
});

describe('diffEditEvent', () => {
	it('returns null when text is unchanged', () => {
		expect(
			diffEditEvent(
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'same' },
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'same' },
			),
		).toBeNull();
	});
	it('returns null when statementType is not option', () => {
		expect(
			diffEditEvent(
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
				{ statementId: 's1', parentId: 'p', statementType: 'question', statement: 'b' },
			),
		).toBeNull();
	});
	it('returns null when after has no text', () => {
		expect(
			diffEditEvent(
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
				{ statementId: 's1', parentId: 'p', statementType: 'option', statement: '' },
			),
		).toBeNull();
	});
	it('returns the diff when text changed', () => {
		const diff = diffEditEvent(
			{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'a' },
			{ statementId: 's1', parentId: 'p', statementType: 'option', statement: 'b' },
		);
		expect(diff).toEqual({
			statementId: 's1',
			parentId: 'p',
			oldText: 'a',
			newText: 'b',
		});
	});
});

describe('liveSynthOnOptionUpdate', () => {
	it('exits immediately when the live-synth flag is OFF', async () => {
		process.env.SYNTHESIS_LIVE_SYNTH_ENABLED = 'false';
		const [before, after] = makeBeforeAfter({}, { statement: 'changed' });
		await liveSynthOnOptionUpdate(before, after);
		expect(mockFindClustersContainingMember).not.toHaveBeenCalled();
	});

	it('exits when the option is not in any cluster', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		mockFindClustersContainingMember.mockResolvedValue([]);
		await liveSynthOnOptionUpdate(before, after);
		expect(mockGenerateEmbedding).not.toHaveBeenCalled();
	});

	it('skips LLM diff when cosine drift is below the floor', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		mockFindClustersContainingMember.mockResolvedValue([
			{ statementId: 'cluster1', integratedOptions: ['opt1', 'opt2'] },
		]);
		// Same vector before and after → drift = 0
		const sameVec = [0.5, 0.5, 0.5];
		mockGenerateEmbedding.mockResolvedValue({ embedding: sameVec });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', sameVec]]));

		await liveSynthOnOptionUpdate(before, after);

		expect(mockJudgeCached).not.toHaveBeenCalled();
	});

	it('keeps the option in cluster when LLM verdict is "same"', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		const fs = setupFirestore();
		mockFindClustersContainingMember.mockResolvedValue([
			{
				statementId: 'cluster1',
				integratedOptions: ['opt1', 'opt2'],
				parentId: 'q1',
			},
		]);
		// Different vectors → drift > floor
		mockGenerateEmbedding.mockResolvedValue({ embedding: [1, 0, 0] });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0, 1, 0]]]));
		mockJudgeCached.mockResolvedValue([{ pairId: 'p', verdict: 'same', reason: 'mocked' }]);

		await liveSynthOnOptionUpdate(before, after);

		expect(mockJudgeCached).toHaveBeenCalledTimes(1);
		expect(fs.updateMock).not.toHaveBeenCalled(); // no unlink
		// Refresh recompute fires so the cluster picks up the new text shape
		expect(mockEnqueueClusterRecompute).toHaveBeenCalledWith('cluster1', 'liveSynth:textRefresh');
		expect(mockSaveEmbedding).toHaveBeenCalled();
	});

	it('unlinks from cluster when LLM verdict is "different" — keeps cluster alive (members ≥ 2)', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		const fs = setupFirestore();
		mockFindClustersContainingMember.mockResolvedValue([
			{
				statementId: 'cluster1',
				integratedOptions: ['opt1', 'opt2', 'opt3'], // 3 members → cluster survives unlink
				parentId: 'q1',
			},
		]);
		mockGenerateEmbedding.mockResolvedValue({ embedding: [1, 0, 0] });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0, 1, 0]]]));
		mockJudgeCached.mockResolvedValue([{ pairId: 'p', verdict: 'different', reason: 'mocked' }]);

		await liveSynthOnOptionUpdate(before, after);

		expect(fs.updateMock).toHaveBeenCalledTimes(1); // cluster integratedOptions update
		const unlinkAudit = mockRecordLiveSynthEvent.mock.calls.find((c) => c[0]?.action === 'unlink');
		expect(unlinkAudit).toBeDefined();
		expect(fs.deleteMock).not.toHaveBeenCalled(); // not dissolved (3 → 2 members)
	});

	it('auto-dissolves a cluster whose member count drops below 2 after unlink', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		const fs = setupFirestore();
		mockFindClustersContainingMember.mockResolvedValue([
			{
				statementId: 'cluster1',
				integratedOptions: ['opt1', 'opt2'], // 2 members → 1 after unlink → dissolve
				parentId: 'q1',
			},
		]);
		mockGenerateEmbedding.mockResolvedValue({ embedding: [1, 0, 0] });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0, 1, 0]]]));
		mockJudgeCached.mockResolvedValue([{ pairId: 'p', verdict: 'different', reason: 'mocked' }]);

		await liveSynthOnOptionUpdate(before, after);

		expect(fs.updateMock).toHaveBeenCalledTimes(1);
		expect(fs.deleteMock).toHaveBeenCalledTimes(1);
		const dissolveAudit = mockRecordLiveSynthEvent.mock.calls.find(
			(c) => c[0]?.action === 'dissolve',
		);
		expect(dissolveAudit).toBeDefined();
		expect(dissolveAudit?.[0]).toMatchObject({ clusterId: 'cluster1' });
	});

	it('keeps a member in a manual cluster (titleLockedByCreator) despite a "different" verdict', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		const fs = setupFirestore();
		mockFindClustersContainingMember.mockResolvedValue([
			{
				statementId: 'manualCluster',
				integratedOptions: ['opt1', 'opt2', 'opt3'],
				parentId: 'q1',
				isCluster: true,
				titleLockedByCreator: true,
			},
		]);
		mockGenerateEmbedding.mockResolvedValue({ embedding: [1, 0, 0] });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0, 1, 0]]]));
		mockJudgeCached.mockResolvedValue([{ pairId: 'p', verdict: 'different', reason: 'mocked' }]);

		await liveSynthOnOptionUpdate(before, after);

		// No unlink write, no dissolve, no unlink audit event — the admin's
		// hand-curated membership is left intact.
		expect(fs.updateMock).not.toHaveBeenCalled();
		expect(fs.deleteMock).not.toHaveBeenCalled();
		const unlinkAudit = mockRecordLiveSynthEvent.mock.calls.find((c) => c[0]?.action === 'unlink');
		expect(unlinkAudit).toBeUndefined();
	});

	it('does NOT dissolve a 2-member manual cluster on a "different" edit', async () => {
		const [before, after] = makeBeforeAfter({}, {});
		const fs = setupFirestore();
		mockFindClustersContainingMember.mockResolvedValue([
			{
				statementId: 'manualCluster',
				integratedOptions: ['opt1', 'opt2'], // would dissolve an auto cluster
				parentId: 'q1',
				isCluster: true,
				titleLockedByCreator: true,
			},
		]);
		mockGenerateEmbedding.mockResolvedValue({ embedding: [1, 0, 0] });
		mockGetBatchEmbeddings.mockResolvedValue(new Map([['opt1', [0, 1, 0]]]));
		mockJudgeCached.mockResolvedValue([{ pairId: 'p', verdict: 'different', reason: 'mocked' }]);

		await liveSynthOnOptionUpdate(before, after);

		expect(fs.deleteMock).not.toHaveBeenCalled();
		expect(fs.updateMock).not.toHaveBeenCalled();
	});

	it('exposes the embedding-drift floor for documentation', () => {
		expect(__INTERNAL.EMBEDDING_DRIFT_FLOOR).toBeGreaterThan(0);
		expect(__INTERNAL.EMBEDDING_DRIFT_FLOOR).toBeLessThan(1);
	});
});

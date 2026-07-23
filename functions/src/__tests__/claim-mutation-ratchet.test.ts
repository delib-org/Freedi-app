import type { Statement } from '@freedi/shared-types';
import { getFirestore } from 'firebase-admin/firestore';
import { applyClaimTextChange } from '../synthesis/consolidation/claimMutation';
import { classifyClaimChange, revalidateMembers } from '../services/claim-registry-service';
import { enqueueItem } from '../synthesis/queue/enqueue';

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(),
}));
jest.mock('firebase-functions', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));
jest.mock('../services/claim-registry-service', () => ({
	classifyClaimChange: jest.fn(),
	revalidateMembers: jest.fn(),
}));
jest.mock('../synthesis/liveSynth/auditLog', () => ({
	recordLiveSynthEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../synthesis/queue/enqueue', () => ({
	enqueueItem: jest.fn().mockResolvedValue(undefined),
}));

const mockClassifyChange = classifyClaimChange as jest.MockedFunction<typeof classifyClaimChange>;
const mockRevalidate = revalidateMembers as jest.MockedFunction<typeof revalidateMembers>;
const mockEnqueue = enqueueItem as jest.MockedFunction<typeof enqueueItem>;

const updateMock = jest.fn().mockResolvedValue(undefined);
const getAllMock = jest.fn();

beforeEach(() => {
	jest.clearAllMocks();
	updateMock.mockResolvedValue(undefined);
	getAllMock.mockResolvedValue([]);
	(getFirestore as jest.Mock).mockReturnValue({
		collection: jest.fn(() => ({
			doc: jest.fn(() => ({ update: updateMock })),
		})),
		getAll: getAllMock,
	});
});

function makeCluster(overrides: Record<string, unknown> = {}): Statement {
	return {
		statementId: 'cluster-1',
		parentId: 'question-1',
		statement: 'old claim',
		canonicalClaim: 'old claim',
		claimVersion: 3,
		claimAnchorText: 'anchor claim',
		claimBroadensSinceAnchor: 0,
		integratedOptions: ['m1', 'm2'],
		...overrides,
	} as unknown as Statement;
}

function lastUpdatePayload(): Record<string, unknown> {
	expect(updateMock).toHaveBeenCalled();

	return updateMock.mock.calls[updateMock.mock.calls.length - 1][0] as Record<string, unknown>;
}

describe('claim mutation broaden-ratchet', () => {
	it('increments the broaden counter under the cap without re-validation', async () => {
		mockClassifyChange.mockResolvedValueOnce('broaden');

		const result = await applyClaimTextChange({
			cluster: makeCluster({ claimBroadensSinceAnchor: 1 }),
			newClaim: 'slightly broader claim',
			newExplanation: '',
			triggerSource: 'test',
		});

		expect(result).toEqual({ change: 'broaden', detachedIds: [] });
		expect(mockClassifyChange).toHaveBeenCalledTimes(1);
		expect(mockRevalidate).not.toHaveBeenCalled();
		const payload = lastUpdatePayload();
		expect(payload.claimBroadensSinceAnchor).toBe(2);
		expect(payload.claimAnchorText).toBe('anchor claim');
	});

	it('checks against the anchor once the cap is exceeded and resets the counter when the chain holds', async () => {
		// step change old→new, then ratchet check anchor→new
		mockClassifyChange.mockResolvedValueOnce('broaden').mockResolvedValueOnce('broaden');

		const result = await applyClaimTextChange({
			cluster: makeCluster({ claimBroadensSinceAnchor: 2 }),
			newClaim: 'broader again',
			newExplanation: '',
			triggerSource: 'test',
		});

		expect(result).toEqual({ change: 'broaden', detachedIds: [] });
		expect(mockClassifyChange).toHaveBeenCalledTimes(2);
		expect(mockClassifyChange).toHaveBeenLastCalledWith('anchor claim', 'broader again');
		expect(mockRevalidate).not.toHaveBeenCalled();
		const payload = lastUpdatePayload();
		expect(payload.claimBroadensSinceAnchor).toBe(0);
		expect(payload.claimAnchorText).toBe('anchor claim');
	});

	it('re-validates members when cumulative broadening drifted from the anchor', async () => {
		mockClassifyChange.mockResolvedValueOnce('broaden').mockResolvedValueOnce('different');
		getAllMock.mockResolvedValue([
			{ exists: true, data: () => ({ statementId: 'm1', statement: 'member one' }) },
			{ exists: true, data: () => ({ statementId: 'm2', statement: 'member two' }) },
		]);
		mockRevalidate.mockResolvedValue({ validIds: ['m1'], detachedIds: ['m2'] });

		const result = await applyClaimTextChange({
			cluster: makeCluster({ claimBroadensSinceAnchor: 2 }),
			newClaim: 'meaning drifted claim',
			newExplanation: '',
			triggerSource: 'test',
		});

		expect(result.detachedIds).toEqual(['m2']);
		expect(mockRevalidate).toHaveBeenCalledTimes(1);
		// Detached member re-enters the pipeline.
		expect(mockEnqueue).toHaveBeenCalledWith(
			expect.objectContaining({ optionId: 'm2', kind: 'process-option' }),
		);
		const payload = lastUpdatePayload();
		// Members were just validated against the new wording — it becomes the anchor.
		expect(payload.claimAnchorText).toBe('meaning drifted claim');
		expect(payload.claimBroadensSinceAnchor).toBe(0);
		expect(payload.integratedOptions).toEqual(['m1']);
	});

	it('leaves the counter and anchor untouched on a reword', async () => {
		mockClassifyChange.mockResolvedValueOnce('reword');

		const result = await applyClaimTextChange({
			cluster: makeCluster({ claimBroadensSinceAnchor: 1 }),
			newClaim: 'same meaning, new words',
			newExplanation: '',
			triggerSource: 'test',
		});

		expect(result).toEqual({ change: 'reword', detachedIds: [] });
		const payload = lastUpdatePayload();
		expect(payload.claimBroadensSinceAnchor).toBe(1);
		expect(payload.claimAnchorText).toBe('anchor claim');
	});

	it('moves the anchor after a narrow-driven re-validation', async () => {
		mockClassifyChange.mockResolvedValueOnce('narrow');
		getAllMock.mockResolvedValue([
			{ exists: true, data: () => ({ statementId: 'm1', statement: 'member one' }) },
			{ exists: true, data: () => ({ statementId: 'm2', statement: 'member two' }) },
		]);
		mockRevalidate.mockResolvedValue({ validIds: ['m1', 'm2'], detachedIds: [] });

		await applyClaimTextChange({
			cluster: makeCluster({ claimBroadensSinceAnchor: 2 }),
			newClaim: 'narrower claim',
			newExplanation: '',
			triggerSource: 'test',
		});

		const payload = lastUpdatePayload();
		expect(payload.claimAnchorText).toBe('narrower claim');
		expect(payload.claimBroadensSinceAnchor).toBe(0);
	});

	it('falls back to the previous claim as anchor for legacy clusters without one', async () => {
		mockClassifyChange.mockResolvedValueOnce('broaden').mockResolvedValueOnce('broaden');

		await applyClaimTextChange({
			cluster: makeCluster({ claimAnchorText: undefined, claimBroadensSinceAnchor: 2 }),
			newClaim: 'broader claim',
			newExplanation: '',
			triggerSource: 'test',
		});

		expect(mockClassifyChange).toHaveBeenLastCalledWith('old claim', 'broader claim');
	});
});

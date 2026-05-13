jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockRunLoading = jest.fn();
const mockRunClustering = jest.fn();
const mockRunVerifying = jest.fn();
const mockRunProposing = jest.fn();
jest.mock('../phases', () => ({
	runLoadingPhase: (...args: unknown[]) => mockRunLoading(...args),
	runClusteringPhase: (...args: unknown[]) => mockRunClustering(...args),
	runVerifyingPhase: (...args: unknown[]) => mockRunVerifying(...args),
	runProposingPhase: (...args: unknown[]) => mockRunProposing(...args),
}));

import {
	dispatchSynthesisJobWrite,
	pickPhaseRunner,
	shouldDispatch,
} from '../fn_synthesisJobDispatch';
import type { SynthesisJob } from '../jobState';

const ORIGINAL_FLAG = process.env.SYNTHESIS_ASYNC_JOB_MODE;

beforeEach(() => {
	mockRunLoading.mockReset();
	mockRunClustering.mockReset();
	mockRunVerifying.mockReset();
	mockRunProposing.mockReset();
	process.env.SYNTHESIS_ASYNC_JOB_MODE = 'true';
});

afterAll(() => {
	if (ORIGINAL_FLAG === undefined) {
		delete process.env.SYNTHESIS_ASYNC_JOB_MODE;
	} else {
		process.env.SYNTHESIS_ASYNC_JOB_MODE = ORIGINAL_FLAG;
	}
});

function makeJob(overrides: Partial<SynthesisJob> = {}): SynthesisJob {
	return {
		jobId: 'j1',
		questionId: 'q1',
		status: 'queued',
		phasesCompleted: [],
		progress: { current: 0, total: 0, message: '' },
		threshold: 0.9,
		filters: {},
		createdBy: 'user1',
		startedAt: 0,
		lastHeartbeat: 0,
		...overrides,
	};
}

function makeEvent(before: SynthesisJob | null, after: SynthesisJob | null) {
	return {
		data: {
			before: before
				? { exists: true, data: () => before }
				: { exists: false, data: () => undefined },
			after: after ? { exists: true, data: () => after } : { exists: false, data: () => undefined },
		},
	};
}

describe('shouldDispatch', () => {
	it('returns false when after is missing', () => {
		expect(shouldDispatch(makeJob(), null)).toBe(false);
	});
	it('returns false for terminal statuses', () => {
		expect(shouldDispatch(makeJob(), makeJob({ status: 'ready-for-review' }))).toBe(false);
		expect(shouldDispatch(makeJob(), makeJob({ status: 'failed' }))).toBe(false);
		expect(shouldDispatch(makeJob(), makeJob({ status: 'cancelled' }))).toBe(false);
	});
	it('returns true for a brand-new doc', () => {
		expect(shouldDispatch(null, makeJob({ status: 'queued' }))).toBe(true);
	});
	it('returns true when status changed', () => {
		expect(shouldDispatch(makeJob({ status: 'loading' }), makeJob({ status: 'clustering' }))).toBe(
			true,
		);
	});
	it('returns false when only heartbeat changed (status same)', () => {
		const before = makeJob({ status: 'clustering', lastHeartbeat: 100 });
		const after = makeJob({ status: 'clustering', lastHeartbeat: 200 });
		expect(shouldDispatch(before, after)).toBe(false);
	});
	it('returns true when _dispatchKick toggled (sweep re-run)', () => {
		const before = makeJob({ status: 'clustering', _dispatchKick: false });
		const after = makeJob({ status: 'clustering', _dispatchKick: true });
		expect(shouldDispatch(before, after)).toBe(true);
	});
});

describe('pickPhaseRunner', () => {
	it('routes queued to loading-phase runner', async () => {
		const loader = pickPhaseRunner('queued');
		expect(loader).not.toBeNull();
		const runner = await loader!();
		await runner('j1');
		expect(mockRunLoading).toHaveBeenCalledWith('j1');
	});
	it('routes clustering / verifying / proposing correctly', async () => {
		await (
			await pickPhaseRunner('clustering')!()
		)('j1');
		await (
			await pickPhaseRunner('verifying')!()
		)('j1');
		await (
			await pickPhaseRunner('proposing')!()
		)('j1');
		expect(mockRunClustering).toHaveBeenCalledWith('j1');
		expect(mockRunVerifying).toHaveBeenCalledWith('j1');
		expect(mockRunProposing).toHaveBeenCalledWith('j1');
	});
	it('returns null for terminal statuses', () => {
		expect(pickPhaseRunner('ready-for-review')).toBeNull();
		expect(pickPhaseRunner('failed')).toBeNull();
		expect(pickPhaseRunner('cancelled')).toBeNull();
	});
});

describe('dispatchSynthesisJobWrite', () => {
	it('exits immediately when the async-job flag is OFF', async () => {
		process.env.SYNTHESIS_ASYNC_JOB_MODE = 'false';
		await dispatchSynthesisJobWrite(makeEvent(null, makeJob({ status: 'queued' })));
		expect(mockRunLoading).not.toHaveBeenCalled();
	});

	it('invokes the loading phase for a brand-new queued job', async () => {
		await dispatchSynthesisJobWrite(makeEvent(null, makeJob({ status: 'queued' })));
		expect(mockRunLoading).toHaveBeenCalledWith('j1');
	});

	it('invokes the right phase for status transitions', async () => {
		await dispatchSynthesisJobWrite(
			makeEvent(makeJob({ status: 'loading' }), makeJob({ status: 'clustering' })),
		);
		expect(mockRunClustering).toHaveBeenCalledWith('j1');
	});

	it('does not invoke any phase when status did not change', async () => {
		await dispatchSynthesisJobWrite(
			makeEvent(
				makeJob({ status: 'verifying', lastHeartbeat: 100 }),
				makeJob({ status: 'verifying', lastHeartbeat: 200 }),
			),
		);
		expect(mockRunVerifying).not.toHaveBeenCalled();
	});

	it('does not invoke any phase for terminal statuses', async () => {
		await dispatchSynthesisJobWrite(
			makeEvent(makeJob({ status: 'proposing' }), makeJob({ status: 'ready-for-review' })),
		);
		expect(mockRunProposing).not.toHaveBeenCalled();
	});

	it('catches phase errors without throwing', async () => {
		mockRunLoading.mockRejectedValue(new Error('boom'));
		await expect(
			dispatchSynthesisJobWrite(makeEvent(null, makeJob({ status: 'queued' }))),
		).resolves.toBeUndefined();
	});
});

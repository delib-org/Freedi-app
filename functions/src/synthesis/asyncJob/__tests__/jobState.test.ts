jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetFirestore = jest.fn();
const mockArrayUnion = jest.fn((...args: unknown[]) => ({ __op: 'arrayUnion', args }));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
	FieldValue: {
		arrayUnion: (...args: unknown[]) => mockArrayUnion(...args),
		serverTimestamp: () => ({ __op: 'serverTimestamp' }),
	},
}));

import {
	createJob,
	getJob,
	claimPhase,
	transitionToNext,
	markFailed,
	markCancelled,
	heartbeat,
	requestCancel,
	isTerminal,
	PHASE_FOR_STATUS,
	type SynthesisJob,
} from '../jobState';

beforeEach(() => {
	mockGetFirestore.mockReset();
	mockArrayUnion.mockClear();
});

function setupDocMock(opts: { exists?: boolean; data?: Partial<SynthesisJob>; docId?: string }) {
	const setMock = jest.fn().mockResolvedValue(undefined);
	const updateMock = jest.fn().mockResolvedValue(undefined);
	const getMock = jest.fn().mockResolvedValue({
		exists: opts.exists ?? true,
		data: () => opts.data,
	});
	const ref = {
		id: opts.docId ?? 'job-123',
		set: setMock,
		update: updateMock,
		get: getMock,
	};
	const docMock = jest.fn().mockReturnValue(ref);
	const collMock = jest.fn().mockReturnValue({ doc: docMock });
	mockGetFirestore.mockReturnValue({
		collection: collMock,
		runTransaction: async (
			fn: (tx: { get: typeof getMock; update: typeof updateMock }) => unknown,
		) => {
			return fn({ get: getMock, update: updateMock });
		},
	});

	return { setMock, updateMock, getMock, ref, docMock, collMock };
}

describe('PHASE_FOR_STATUS map', () => {
	it('routes queued and loading both to the loading phase', () => {
		expect(PHASE_FOR_STATUS.queued).toBe('loading');
		expect(PHASE_FOR_STATUS.loading).toBe('loading');
	});
	it('has no entry for terminal statuses', () => {
		expect(PHASE_FOR_STATUS['ready-for-review']).toBeUndefined();
		expect(PHASE_FOR_STATUS.failed).toBeUndefined();
		expect(PHASE_FOR_STATUS.cancelled).toBeUndefined();
	});
});

describe('isTerminal', () => {
	it('flags ready-for-review, failed, cancelled as terminal', () => {
		expect(isTerminal('ready-for-review')).toBe(true);
		expect(isTerminal('failed')).toBe(true);
		expect(isTerminal('cancelled')).toBe(true);
	});
	it('does not flag in-progress statuses as terminal', () => {
		expect(isTerminal('queued')).toBe(false);
		expect(isTerminal('loading')).toBe(false);
		expect(isTerminal('clustering')).toBe(false);
	});
});

describe('createJob', () => {
	it('creates a queued job and returns its id', async () => {
		const fs = setupDocMock({ docId: 'new-job-1' });
		const id = await createJob({
			questionId: 'q1',
			threshold: 0.9,
			filters: {},
			createdBy: 'user1',
		});
		expect(id).toBe('new-job-1');
		expect(fs.setMock).toHaveBeenCalledTimes(1);
		const written = fs.setMock.mock.calls[0][0] as SynthesisJob;
		expect(written).toMatchObject({
			jobId: 'new-job-1',
			questionId: 'q1',
			status: 'queued',
			phasesCompleted: [],
			createdBy: 'user1',
		});
		expect(typeof written.startedAt).toBe('number');
		expect(typeof written.lastHeartbeat).toBe('number');
	});
});

describe('getJob', () => {
	it('returns null when the doc does not exist', async () => {
		setupDocMock({ exists: false });
		expect(await getJob('missing')).toBeNull();
	});
	it('returns the job data when present', async () => {
		setupDocMock({
			exists: true,
			data: { jobId: 'j1', status: 'loading' } as Partial<SynthesisJob>,
		});
		const job = await getJob('j1');
		expect(job?.jobId).toBe('j1');
		expect(job?.status).toBe('loading');
	});
});

describe('claimPhase', () => {
	it('returns false when the job does not exist', async () => {
		setupDocMock({ exists: false });
		expect(await claimPhase('missing', 'loading')).toBe(false);
	});

	it('returns false when the job status is terminal', async () => {
		const fs = setupDocMock({
			exists: true,
			data: { status: 'ready-for-review', phasesCompleted: [] } as Partial<SynthesisJob>,
		});
		expect(await claimPhase('j1', 'loading')).toBe(false);
		expect(fs.updateMock).not.toHaveBeenCalled();
	});

	it('returns false AND transitions to cancelled when cancelRequested is set', async () => {
		const fs = setupDocMock({
			exists: true,
			data: {
				status: 'loading',
				phasesCompleted: [],
				cancelRequested: true,
			} as Partial<SynthesisJob>,
		});
		expect(await claimPhase('j1', 'loading')).toBe(false);
		expect(fs.updateMock).toHaveBeenCalledTimes(1);
		// claimPhase runs inside a transaction, so the call is (ref, data).
		const update = fs.updateMock.mock.calls[0][1] as Record<string, unknown>;
		expect(update.status).toBe('cancelled');
	});

	it('returns false when the phase is already completed (idempotency)', async () => {
		const fs = setupDocMock({
			exists: true,
			data: {
				status: 'loading',
				phasesCompleted: ['loading'],
			} as Partial<SynthesisJob>,
		});
		expect(await claimPhase('j1', 'loading')).toBe(false);
		expect(fs.updateMock).not.toHaveBeenCalled();
	});

	it('returns true and stamps status + heartbeat when claim succeeds', async () => {
		const fs = setupDocMock({
			exists: true,
			data: {
				status: 'queued',
				phasesCompleted: [],
			} as Partial<SynthesisJob>,
		});
		expect(await claimPhase('j1', 'loading')).toBe(true);
		expect(fs.updateMock).toHaveBeenCalledTimes(1);
		const update = fs.updateMock.mock.calls[0][1] as Record<string, unknown>;
		expect(update.status).toBe('loading');
		expect(typeof update.lastHeartbeat).toBe('number');
	});
});

describe('transitionToNext', () => {
	it('writes phasesCompleted via arrayUnion + advances status', async () => {
		const fs = setupDocMock({ exists: true });
		await transitionToNext('j1', {
			phase: 'clustering',
			nextStatus: 'verifying',
			payload: { clusterAssignments: [{ clusterId: 'c1', memberIds: ['a', 'b'] }] },
		});
		expect(fs.updateMock).toHaveBeenCalledTimes(1);
		const update = fs.updateMock.mock.calls[0][0];
		expect(update.status).toBe('verifying');
		expect(mockArrayUnion).toHaveBeenCalledWith('clustering');
		expect(typeof update.lastHeartbeat).toBe('number');
	});

	it('stamps completedAt when transitioning to ready-for-review', async () => {
		const fs = setupDocMock({ exists: true });
		await transitionToNext('j1', {
			phase: 'proposing',
			nextStatus: 'ready-for-review',
			payload: { proposals: [] },
		});
		const update = fs.updateMock.mock.calls[0][0];
		expect(typeof update.completedAt).toBe('number');
	});
});

describe('markFailed / markCancelled / requestCancel / heartbeat', () => {
	it('markFailed records the error message + completedAt', async () => {
		const fs = setupDocMock({ exists: true });
		await markFailed('j1', new Error('boom'));
		const update = fs.updateMock.mock.calls[0][0];
		expect(update.status).toBe('failed');
		expect(update.error).toBe('boom');
		expect(typeof update.completedAt).toBe('number');
	});

	it('markFailed swallows write errors without throwing', async () => {
		const fs = setupDocMock({ exists: true });
		fs.updateMock.mockRejectedValueOnce(new Error('firestore offline'));
		await expect(markFailed('j1', 'orig')).resolves.toBeUndefined();
	});

	it('markCancelled sets status + cancelRequested + completedAt', async () => {
		const fs = setupDocMock({ exists: true });
		await markCancelled('j1');
		const update = fs.updateMock.mock.calls[0][0];
		expect(update.status).toBe('cancelled');
		expect(update.cancelRequested).toBe(true);
		expect(typeof update.completedAt).toBe('number');
	});

	it('requestCancel only sets the flag, leaving phase to transition itself', async () => {
		const fs = setupDocMock({ exists: true });
		await requestCancel('j1');
		const update = fs.updateMock.mock.calls[0][0];
		expect(update.cancelRequested).toBe(true);
		expect(update.status).toBeUndefined();
	});

	it('heartbeat updates lastHeartbeat and optional progress message', async () => {
		const fs = setupDocMock({ exists: true });
		await heartbeat('j1', 'still working');
		const update = fs.updateMock.mock.calls[0][0];
		expect(typeof update.lastHeartbeat).toBe('number');
		expect(update['progress.message']).toBe('still working');
	});

	it('heartbeat without message only writes lastHeartbeat', async () => {
		const fs = setupDocMock({ exists: true });
		await heartbeat('j1');
		const update = fs.updateMock.mock.calls[0][0];
		expect(typeof update.lastHeartbeat).toBe('number');
		expect(update['progress.message']).toBeUndefined();
	});
});

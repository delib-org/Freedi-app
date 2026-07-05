jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const collMock = jest.fn();
const runTransactionMock = jest.fn();
jest.mock('../../db', () => ({
	db: {
		collection: (...args: unknown[]) => collMock(...args),
		runTransaction: (...args: unknown[]) => runTransactionMock(...args),
	},
}));

import { logModerationRejection } from '../moderation-log-service';

interface DocData {
	[field: string]: unknown;
}

function setupDb(opts: { exists: boolean; data?: DocData }) {
	const setMock = jest.fn();
	const updateMock = jest.fn();
	const getMock = jest.fn().mockResolvedValue({
		exists: opts.exists,
		data: () => opts.data,
	});
	let capturedDocId = '';
	const ref = {
		get id() {
			return capturedDocId;
		},
		set: setMock,
		update: updateMock,
	};
	const docMock = jest.fn((id: string) => {
		capturedDocId = id;

		return ref;
	});
	collMock.mockReturnValue({ doc: docMock });
	runTransactionMock.mockImplementation(
		async (
			fn: (tx: { get: typeof getMock; set: typeof setMock; update: typeof updateMock }) => unknown,
		) => fn({ get: getMock, set: setMock, update: updateMock }),
	);

	return { setMock, updateMock, docMock };
}

const baseParams = {
	originalText: 'you are all fools',
	reason: 'personal attack',
	category: 'personal_attack',
	userId: 'user-1',
	displayName: 'Dana',
	parentId: 'question-9',
	topParentId: 'top-9',
};

beforeEach(() => {
	collMock.mockReset();
	runTransactionMock.mockReset();
});

describe('logModerationRejection', () => {
	it('writes to a deterministic user+question doc id', async () => {
		const { docMock } = setupDb({ exists: false });
		await logModerationRejection(baseParams);
		expect(docMock).toHaveBeenCalledWith('user-1__question-9');
	});

	it('creates a fresh row with attemptCount 1 on the first rejection', async () => {
		const { setMock, updateMock } = setupDb({ exists: false });
		await logModerationRejection(baseParams);

		expect(updateMock).not.toHaveBeenCalled();
		expect(setMock).toHaveBeenCalledTimes(1);
		const written = setMock.mock.calls[0][1] as DocData;
		expect(written.attemptCount).toBe(1);
		expect(written.moderationId).toBe('user-1__question-9');
		expect(written.createdAt).toBe(written.lastAttemptAt);
		expect(written.userId).toBe('user-1');
	});

	it('coalesces a repeat rejection by incrementing attemptCount, not writing a new row', async () => {
		const { setMock, updateMock } = setupDb({
			exists: true,
			data: { attemptCount: 2, createdAt: 1000, displayName: 'Dana' },
		});
		await logModerationRejection({ ...baseParams, originalText: 'still fools', reason: 'again' });

		expect(setMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledTimes(1);
		const patch = updateMock.mock.calls[0][1] as DocData;
		expect(patch.attemptCount).toBe(3);
		// latest offending content wins
		expect(patch.originalText).toBe('still fools');
		expect(patch.reason).toBe('again');
		// createdAt is not overwritten on an update
		expect(patch.createdAt).toBeUndefined();
		expect(typeof patch.lastAttemptAt).toBe('number');
	});

	it('treats a legacy row with no attemptCount as one prior attempt', async () => {
		const { updateMock } = setupDb({ exists: true, data: { createdAt: 1000 } });
		await logModerationRejection(baseParams);
		const patch = updateMock.mock.calls[0][1] as DocData;
		expect(patch.attemptCount).toBe(2);
	});

	it('strips slashes from ids so the doc id stays Firestore-safe', async () => {
		const { docMock } = setupDb({ exists: false });
		await logModerationRejection({ ...baseParams, userId: 'a/b', parentId: 'c/d' });
		expect(docMock).toHaveBeenCalledWith('a_b__c_d');
	});
});

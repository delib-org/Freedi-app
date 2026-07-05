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

import { reserveErrorNotificationSlot } from '../error-notification-service';

interface DocData {
	[field: string]: unknown;
}

const HOUR = 60 * 60 * 1000;

function setupDb(opts: { data?: DocData }) {
	const setMock = jest.fn();
	const getMock = jest.fn().mockResolvedValue({
		exists: opts.data !== undefined,
		data: () => opts.data,
	});
	let capturedDocId = '';
	const ref = {
		get id() {
			return capturedDocId;
		},
		set: setMock,
	};
	const docMock = jest.fn((id: string) => {
		capturedDocId = id;

		return ref;
	});
	collMock.mockReturnValue({ doc: docMock });
	runTransactionMock.mockImplementation(
		async (fn: (tx: { get: typeof getMock; set: typeof setMock }) => unknown) =>
			fn({ get: getMock, set: setMock }),
	);

	return { setMock, docMock };
}

beforeEach(() => {
	collMock.mockReset();
	runTransactionMock.mockReset();
});

describe('reserveErrorNotificationSlot', () => {
	it('grants the first-ever slot and resets the suppressed counter', async () => {
		const { setMock } = setupDb({ data: undefined });
		const res = await reserveErrorNotificationSlot('AI Model Error', 10 * HOUR);

		expect(res.send).toBe(true);
		expect(res.suppressedSinceLast).toBe(0);
		const patch = setMock.mock.calls[0][1] as DocData;
		expect(patch.lastSentAt).toBe(10 * HOUR);
		expect(patch.suppressedCount).toBe(0);
	});

	it('grants a slot once the hour has elapsed and reports how many were suppressed', async () => {
		const { setMock } = setupDb({ data: { lastSentAt: 0, suppressedCount: 7 } });
		const res = await reserveErrorNotificationSlot('AI Model Error', HOUR + 1);

		expect(res.send).toBe(true);
		expect(res.suppressedSinceLast).toBe(7);
		const patch = setMock.mock.calls[0][1] as DocData;
		expect(patch.lastSentAt).toBe(HOUR + 1);
		expect(patch.suppressedCount).toBe(0);
	});

	it('throttles within the hour and increments the suppressed counter', async () => {
		const { setMock } = setupDb({ data: { lastSentAt: HOUR, suppressedCount: 2 } });
		const res = await reserveErrorNotificationSlot('AI Model Error', HOUR + 60_000);

		expect(res.send).toBe(false);
		expect(res.suppressedSinceLast).toBe(3);
		const patch = setMock.mock.calls[0][1] as DocData;
		expect(patch.suppressedCount).toBe(3);
		expect(patch.lastSentAt).toBeUndefined(); // not refreshed while throttled
	});

	it('keys the throttle doc by a Firestore-safe error type', async () => {
		const { docMock } = setupDb({ data: undefined });
		await reserveErrorNotificationSlot('rate/limit', HOUR);
		expect(docMock).toHaveBeenCalledWith('rate_limit');
	});
});

const transactionUpdate = jest.fn();
let storedStatement: Record<string, unknown> | undefined;

jest.mock('firebase/firestore', () => ({
	getDoc: jest.fn(),
	updateDoc: jest.fn(),
	runTransaction: jest.fn(async (_db: unknown, run: (t: unknown) => Promise<unknown>) =>
		run({
			get: async () => ({
				exists: () => storedStatement !== undefined,
				data: () => storedStatement,
			}),
			update: transactionUpdate,
		}),
	),
}));
jest.mock('../../config', () => ({ FireStore: {} }));
jest.mock('@/redux/store', () => ({ store: { getState: jest.fn() } }));
jest.mock('@/services/logger', () => ({ logger: { info: jest.fn() } }));
jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: jest.fn(() => ({ id: 'ref' })),
	getCurrentTimestamp: jest.fn(() => 1234),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import { toggleStatementHide } from '../statementVisibility';

const MARK = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'e' };

beforeEach(() => {
	transactionUpdate.mockClear();
});

describe('toggleStatementHide and the automatic check', () => {
	it('records the restore when a host unhides a flagged answer', async () => {
		storedStatement = { hide: true, answerModeration: MARK };

		await expect(toggleStatementHide('answer-1')).resolves.toBe(false);

		expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
			hide: false,
			'answerModeration.restoredAt': 1234,
		});
	});

	it('keeps the first restore time on a later unhide', async () => {
		storedStatement = { hide: true, answerModeration: { ...MARK, restoredAt: 5 } };

		await toggleStatementHide('answer-1');

		expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), { hide: false });
	});

	it('writes only hide for an answer hidden by hand', async () => {
		storedStatement = { hide: true };

		await toggleStatementHide('answer-1');

		expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), { hide: false });
	});

	it('writes only hide when hiding', async () => {
		storedStatement = { hide: false };

		await expect(toggleStatementHide('answer-1')).resolves.toBe(true);

		expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), { hide: true });
	});
});

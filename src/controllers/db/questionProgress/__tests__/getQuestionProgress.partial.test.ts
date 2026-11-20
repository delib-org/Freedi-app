import { getDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { getQuestionProgress } from '../getQuestionProgress';

// The real valibot and QuestionProgressSchema are used here on purpose (jest
// maps `valibot` to an always-succeeding stub, and the sibling test stubs
// safeParse): this file proves what a partial prod document renders as.
jest.mock('valibot', () =>
	jest.requireActual('../../../../../node_modules/valibot/dist/index.cjs'),
);
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn() }));
jest.mock('@/utils/firebaseUtils', () => ({ createDocRef: jest.fn(() => 'ref') }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const mockGetDoc = getDoc as unknown as jest.Mock;

function mockDoc(data: Record<string, unknown>): void {
	mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });
}

describe('getQuestionProgress with partial documents (FREEDI-APP-3Q)', () => {
	let infoSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
	});

	afterEach(() => infoSpy.mockRestore());

	it('reads a nudge-only document as zero counters without logging an error', async () => {
		mockDoc({ statementId: 'q1', lastNudgeAt: 5, lastUpdate: 5 });

		const result = await getQuestionProgress('q1');

		expect(result).toMatchObject({
			statementId: 'q1',
			entered: 0,
			suggested: 0,
			evaluated: 0,
			options: 0,
			evaluations: 0,
			lastNudgeAt: 5,
		});
		expect(logError).not.toHaveBeenCalled();
		expect(infoSpy).toHaveBeenCalledTimes(1);
	});

	it('keeps the real counters of a document that lacks only some fields', async () => {
		mockDoc({ statementId: 'q1', topParentId: 'top', entered: 12, evaluated: 9, lastUpdate: 1 });

		const result = await getQuestionProgress('q1');

		expect(result).toMatchObject({ entered: 12, evaluated: 9, suggested: 0, topParentId: 'top' });
		expect(logError).not.toHaveBeenCalled();
	});

	it('stays quiet for a complete document', async () => {
		mockDoc({
			statementId: 'q1',
			topParentId: 'q1',
			entered: 1,
			suggested: 1,
			evaluated: 1,
			options: 1,
			evaluations: 1,
			lastActivity: 1,
			lastUpdate: 1,
		});

		await getQuestionProgress('q1');

		expect(infoSpy).not.toHaveBeenCalled();
		expect(logError).not.toHaveBeenCalled();
	});

	it('still logs an error for a corrupt document (wrong types)', async () => {
		mockDoc({ statementId: 'q1', entered: 'many', lastUpdate: 1 });

		await expect(getQuestionProgress('q1')).resolves.toBeNull();
		expect(logError).toHaveBeenCalledTimes(1);
	});
});

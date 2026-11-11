import { getDoc } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { getStatementFromDB } from '../getStatement';

jest.mock('firebase/firestore', () => ({
	and: jest.fn(),
	getDoc: jest.fn(),
	getDocs: jest.fn(),
	or: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: jest.fn(() => ({})),
	createCollectionRef: jest.fn(() => ({})),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

describe('getStatementFromDB refusals', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each(['permission-denied', 'unavailable'])(
		'stays quiet on %s when a refusal is expected',
		async (code) => {
			(getDoc as jest.Mock).mockRejectedValue({ code });

			await expect(getStatementFromDB('s1', { expectRefusal: true })).resolves.toBeUndefined();
			expect(logError).not.toHaveBeenCalled();
		},
	);

	it('still logs other failures when a refusal is expected', async () => {
		(getDoc as jest.Mock).mockRejectedValue(new Error('boom'));

		await expect(getStatementFromDB('s1', { expectRefusal: true })).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('logs a refusal for callers that did not expect one', async () => {
		(getDoc as jest.Mock).mockRejectedValue({ code: 'permission-denied' });

		await getStatementFromDB('s1');

		expect(logError).toHaveBeenCalledTimes(1);
	});
});

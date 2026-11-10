import { getDoc } from 'firebase/firestore';
import { getOwnVote } from '../getVotes';
import { logError } from '@/utils/errorHandling';

jest.mock('firebase/firestore', () => ({
	collection: jest.fn(),
	getDoc: jest.fn(),
	getDocs: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
}));
jest.mock('../../config', () => ({ FireStore: {} }));
jest.mock('@/utils/firebaseUtils', () => ({ createDocRef: jest.fn(() => 'ref') }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

const getDocMock = getDoc as jest.Mock;

const stored = {
	voteId: 'v1',
	statementId: 'none',
	parentId: 'q1',
	userId: 'u1',
	createdAt: 1,
	lastUpdate: 1,
};

describe('getOwnVote', () => {
	beforeEach(() => jest.clearAllMocks());

	it('returns a withdrawn vote as stored, with one read and no lookup of the "none" option', async () => {
		getDocMock.mockResolvedValue({ exists: () => true, data: () => stored });
		await expect(getOwnVote('q1', 'u1')).resolves.toMatchObject({ statementId: 'none' });
		expect(getDocMock).toHaveBeenCalledTimes(1);
		expect(logError).not.toHaveBeenCalled();
	});

	it('returns undefined when the person never voted', async () => {
		getDocMock.mockResolvedValue({ exists: () => false });
		await expect(getOwnVote('q1', 'u1')).resolves.toBeUndefined();
	});

	it('logs with context and returns undefined on failure', async () => {
		getDocMock.mockRejectedValue(new Error('denied'));
		await expect(getOwnVote('q1', 'u1')).resolves.toBeUndefined();
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'vote.getVotes.getOwnVote', userId: 'u1' }),
		);
	});
});

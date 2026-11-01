import { getDocs, where } from 'firebase/firestore';
import { Collections, UserDemographicQuestion } from '@freedi/shared-types';
import { DatabaseError } from '@/utils/errorHandling';
import { chunk, getInheritedDemographicAnswers } from '../getInheritedDemographicAnswers';

jest.mock('firebase/firestore', () => ({
	getDocs: jest.fn(),
	query: jest.fn((collection: string, ...filters: unknown[]) => ({ collection, filters })),
	where: jest.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createCollectionRef: (name: string) => name,
}));
jest.mock('@/utils/errorHandling', () => {
	class MockDatabaseError extends Error {}

	return { logError: jest.fn(), DatabaseError: MockDatabaseError };
});

const mockedGetDocs = getDocs as jest.Mock;
const mockedWhere = where as jest.Mock;

const snapshot = (rows: object[]) => ({ docs: rows.map((row) => ({ data: () => row })) });
const question = (userQuestionId: string, statementId = 'g1') =>
	({ userQuestionId, statementId }) as UserDemographicQuestion;

describe('getInheritedDemographicAnswers', () => {
	beforeEach(() => jest.clearAllMocks());

	it('reads nothing when no group question is inherited', async () => {
		expect(await getInheritedDemographicAnswers('q1', [])).toEqual([]);
		expect(mockedGetDocs).not.toHaveBeenCalled();
	});

	it("reads only this space's members' answers on the group, for the asked questions", async () => {
		mockedGetDocs
			.mockResolvedValueOnce(snapshot([{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]))
			.mockResolvedValueOnce(
				snapshot([
					{ userId: 'a', userQuestionId: 'gq1', answer: 'Yes' },
					{ userId: 'b', userQuestionId: 'skipped', answer: 'No' },
				]),
			);

		const answers = await getInheritedDemographicAnswers('q1', [question('gq1')]);

		expect(answers).toEqual([{ userId: 'a', userQuestionId: 'gq1', answer: 'Yes' }]);
		expect(mockedGetDocs).toHaveBeenCalledTimes(2);
		expect(mockedWhere).toHaveBeenCalledWith('statementId', '==', 'q1');
		expect(mockedWhere).toHaveBeenCalledWith('statementId', '==', 'g1');
		expect(mockedWhere).toHaveBeenCalledWith('userId', 'in', ['a', 'b']);
		expect(mockedGetDocs.mock.calls[0][0].collection).toBe(Collections.statementsSubscribe);
	});

	it('stops after the members read when the space has no members', async () => {
		mockedGetDocs.mockResolvedValueOnce(snapshot([]));

		expect(await getInheritedDemographicAnswers('q1', [question('gq1')])).toEqual([]);
		expect(mockedGetDocs).toHaveBeenCalledTimes(1);
	});

	it('throws a DatabaseError when a read fails', async () => {
		mockedGetDocs.mockRejectedValueOnce(new Error('denied'));

		await expect(getInheritedDemographicAnswers('q1', [question('gq1')])).rejects.toBeInstanceOf(
			DatabaseError,
		);
	});
});

describe('chunk', () => {
	it('splits into groups no larger than the size', () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 30)).toEqual([]);
	});
});

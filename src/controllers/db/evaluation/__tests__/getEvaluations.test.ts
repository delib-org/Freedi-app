/**
 * The admin "Get Evaluators" panel: names come only from the vote itself, and
 * a vote with no name must not cost the panel the votes that have one.
 */

jest.mock('@freedi/shared-types', () => ({
	Collections: { evaluations: 'evaluations', users: 'usersV2' },
	EvaluationSchema: {},
}));
jest.mock('valibot', () => ({ parse: (_schema: unknown, data: unknown) => data }));

const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
jest.mock('firebase/firestore', () => ({
	query: jest.fn(),
	where: jest.fn(),
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

const mockLogError = jest.fn();
jest.mock('@/utils/errorHandling', () => ({
	logError: (...args: unknown[]) => mockLogError(...args),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createCollectionRef: jest.fn(),
	createEvaluationRef: jest.fn(),
}));
jest.mock('@/redux/evaluations/evaluationsSlice', () => ({ setEvaluationToStore: jest.fn() }));
jest.mock('@/redux/store', () => ({ store: { getState: jest.fn(), dispatch: jest.fn() } }));
jest.mock('@/controllers/general/helpers', () => ({ getStatementSubscriptionId: jest.fn() }));
jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	createManagedCollectionListener: jest.fn(),
	createManagedDocumentListener: jest.fn(),
	generateListenerKey: jest.fn(),
}));
jest.mock('@/controllers/db/config', () => ({ auth: { currentUser: null } }));

import { getEvaluations } from '../getEvaluation';

function vote(evaluatorId: string, evaluator?: Record<string, unknown>): Record<string, unknown> {
	return {
		parentId: 'q1',
		evaluationId: `${evaluatorId}--opt1`,
		statementId: 'opt1',
		evaluatorId,
		updatedAt: 1,
		evaluation: 1,
		...(evaluator ? { evaluator } : {}),
	};
}

function resolveWith(votes: Record<string, unknown>[]): void {
	mockGetDocs.mockResolvedValue({ docs: votes.map((data) => ({ data: () => data })) });
}

describe('getEvaluations', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('keeps a named vote next to a vote with no evaluator, and looks nobody up', async () => {
		resolveWith([vote('alice', { uid: 'alice', displayName: 'Alice' }), vote('flow-user')]);

		const result = await getEvaluations('q1');

		expect(result.map((evaluation) => evaluation.evaluatorId)).toEqual(['alice', 'flow-user']);
		expect(result[0].evaluator).toEqual({ uid: 'alice', displayName: 'Alice' });
		expect(result[1].evaluator).toBeUndefined();
		expect(mockGetDoc).not.toHaveBeenCalled();
	});

	it('passes on only the name, even when the stored map holds more', async () => {
		resolveWith([
			vote('alice', {
				uid: 'alice',
				displayName: 'Alice',
				email: 'alice@example.com',
				photoURL: 'https://example.com/a.png',
				systemAdmin: true,
			}),
		]);

		const [evaluation] = await getEvaluations('q1');

		expect(evaluation.evaluator).toEqual({ uid: 'alice', displayName: 'Alice' });
		expect(JSON.stringify(evaluation)).not.toContain('alice@example.com');
	});

	it('still lists each evaluator once', async () => {
		const evaluator = { uid: 'alice', displayName: 'Alice' };
		resolveWith([vote('alice', evaluator), vote('alice', evaluator)]);

		expect(await getEvaluations('q1')).toHaveLength(1);
	});

	it('treats a permission-denied read as expected: empty, and not reported', async () => {
		mockGetDocs.mockRejectedValue({ code: 'permission-denied' });

		expect(await getEvaluations('q1')).toEqual([]);
		expect(mockLogError).not.toHaveBeenCalled();
	});

	it('reports an unexpected failure', async () => {
		const failure = new Error('network down');
		mockGetDocs.mockRejectedValue(failure);

		expect(await getEvaluations('q1')).toEqual([]);
		expect(mockLogError).toHaveBeenCalledWith(
			failure,
			expect.objectContaining({ operation: 'evaluation.getEvaluation.evaluator' }),
		);
	});
});

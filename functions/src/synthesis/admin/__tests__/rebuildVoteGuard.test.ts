/**
 * Both rebuild callables (reCluster, globalCluster) must refuse BEFORE
 * dissolving when the question's merged ideas carry direct votes.
 */

class MockHttpsError extends Error {
	code: string;
	details?: unknown;
	constructor(code: string, message: string, details?: unknown) {
		super(message);
		this.code = code;
		this.details = details;
	}
}

jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: MockHttpsError,
}));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => ({
		collection: () => ({
			doc: () => ({ get: async () => ({ exists: false }) }),
		}),
	}),
}));
jest.mock('p-limit', () => () => (fn: () => unknown) => fn());
jest.mock('../assertSynthesisAdmin', () => ({
	assertSynthesisAdmin: jest.fn(async () => ({ statementId: 'q1' })),
}));
jest.mock('../../pipeline/loadSynthesisSettings', () => ({
	loadSynthesisSettings: jest.fn(async () => ({ minEvaluators: 0 })),
}));
jest.mock('../../queue/enqueue', () => ({ enqueueItem: jest.fn(), initProgressDoc: jest.fn() }));
jest.mock('../../derivedDocs', () => ({ dissolveQuestionSynthesis: jest.fn() }));
jest.mock('../../derivedDocVotes', () => ({ assertNoDirectVotesOnDerivedDocs: jest.fn() }));
jest.mock('../../bulkCluster', () => ({ cosineSimilarity: jest.fn(), meanVector: jest.fn() }));
jest.mock('../../completeLinkage', () => ({ refineComponent: jest.fn() }));
jest.mock('../../../services/verdict-cache-service', () => ({
	judgeSemanticEquivalenceCached: jest.fn(),
}));
jest.mock('../../../services/embedding-cache-service', () => ({ embeddingCache: {} }));
jest.mock('../../../services/integration-ai-service', () => ({
	generateTopicLabel: jest.fn(),
	generateSynthesizedProposal: jest.fn(),
}));
jest.mock('../../../integrate/performIntegration', () => ({ performIntegration: jest.fn() }));
jest.mock('../../../condensation/aggregation', () => ({ recomputeClusterEvaluation: jest.fn() }));

import { dissolveQuestionSynthesis } from '../../derivedDocs';
import { assertNoDirectVotesOnDerivedDocs } from '../../derivedDocVotes';
import { reCluster } from '../fn_reCluster';
import { globalCluster } from '../fn_globalCluster';

type Handler = (request: {
	auth?: { uid: string };
	data: { questionId: string };
}) => Promise<unknown>;

const callables: Array<[string, Handler]> = [
	['reCluster', reCluster as unknown as Handler],
	['globalCluster', globalCluster as unknown as Handler],
];
const request = { auth: { uid: 'admin1' }, data: { questionId: 'q1' } };
const STOP = new Error('stop-after-dissolve');

const refusal = new MockHttpsError('failed-precondition', 'blocked', {
	reason: 'derived-docs-have-votes',
	votedDocCount: 2,
	voteCount: 7,
});

describe.each(callables)('%s vote guard', (_name, handler) => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('refuses before dissolving when merged ideas have votes', async () => {
		(assertNoDirectVotesOnDerivedDocs as jest.Mock).mockRejectedValueOnce(refusal);

		await expect(handler(request)).rejects.toMatchObject({
			code: 'failed-precondition',
			details: { reason: 'derived-docs-have-votes', votedDocCount: 2, voteCount: 7 },
		});
		expect(assertNoDirectVotesOnDerivedDocs).toHaveBeenCalledWith('q1');
		expect(dissolveQuestionSynthesis).not.toHaveBeenCalled();
	});

	it('goes on to dissolve when there are no votes', async () => {
		(assertNoDirectVotesOnDerivedDocs as jest.Mock).mockResolvedValueOnce(undefined);
		(dissolveQuestionSynthesis as jest.Mock).mockRejectedValueOnce(STOP);

		await expect(handler(request)).rejects.toBe(STOP);
		expect(dissolveQuestionSynthesis).toHaveBeenCalledWith('q1', { reversedByUserId: 'admin1' });
	});
});

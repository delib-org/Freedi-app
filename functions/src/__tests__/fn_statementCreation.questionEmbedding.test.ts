/**
 * onStatementCreated → question branch: every new question (top-level ones
 * included) is handed to the question-embedding store; options are not.
 * Every other creation task is mocked away.
 */
jest.mock('../index', () => ({ db: {} }));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: {} }));

const mockEmbedNewQuestion = jest.fn((_statement: unknown) => Promise.resolve());
const mockOptionEmbedding = jest.fn();
jest.mock('../services/question-embedding-store', () => ({
	embedNewQuestion: (statement: unknown) => mockEmbedNewQuestion(statement),
}));
jest.mock('../services/embedding-service', () => ({
	embeddingService: {
		generateEmbeddingWithRetry: (...args: unknown[]) => mockOptionEmbedding(...args),
	},
}));
jest.mock('../services/embedding-cache-service', () => ({
	embeddingCache: {
		getBatchEmbeddings: () => Promise.resolve(new Map([['any', [1]]])),
		saveEmbedding: jest.fn(),
	},
}));
jest.mock('../services/hybrid-vector-service', () => ({
	computeHybridVector: jest.fn(),
	isHybridClusteringEnabled: () => false,
	saveHybridEmbedding: jest.fn(),
}));
jest.mock('../notifications/notifyStatementSubscribers', () => ({
	notifyStatementSubscribers: jest.fn(() => Promise.resolve()),
}));
jest.mock('../engagement/credits/trackEngagement', () => ({
	trackStatementCreation: jest.fn(() => Promise.resolve()),
}));
jest.mock('../fn_adminStats', () => ({
	onStatementCreatedStats: jest.fn(() => Promise.resolve()),
}));
jest.mock('../progress/statementCreationHook', () => ({
	recordSuggestionProgress: jest.fn(() => Promise.resolve()),
}));
jest.mock('../helpers', () => ({ generateDescriptionFromChildren: jest.fn() }));
jest.mock('../userFeed/recordDiscussionActivity', () => ({
	recordDiscussionActivity: jest.fn(() => Promise.resolve()),
}));
jest.mock('../classroom/autoEvaluations', () => ({ onClassOptionCreated: jest.fn() }));
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../setupAdminsForStatement', () => ({
	setupAdminsForStatement: jest.fn(() => Promise.resolve()),
}));

import type { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { onStatementCreated } from '../fn_statementCreation';

type CreatedEvent = FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>;

function created(data: Record<string, unknown>): CreatedEvent {
	return {
		data: { data: () => data },
		params: { statementId: String(data.statementId) },
	} as unknown as CreatedEvent;
}

function statement(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		statementId: 'q1',
		statement: 'How should we spend the park budget?',
		statementType: 'question',
		parentId: 'top',
		topParentId: 'q1',
		parents: [],
		creatorId: 'alice',
		creator: { uid: 'alice', displayName: 'Alice' },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	};
}

beforeEach(() => {
	mockEmbedNewQuestion.mockClear();
});

describe('onStatementCreated → question embedding', () => {
	it('embeds a new top-level question', async () => {
		await onStatementCreated(created(statement({})));

		expect(mockEmbedNewQuestion).toHaveBeenCalledTimes(1);
		expect(mockEmbedNewQuestion.mock.calls[0][0]).toMatchObject({
			statementId: 'q1',
			parentId: 'top',
		});
	});

	it('embeds a nested question', async () => {
		await onStatementCreated(
			created(statement({ statementId: 'q2', parentId: 'g1', topParentId: 'g1', parents: ['g1'] })),
		);

		expect(mockEmbedNewQuestion).toHaveBeenCalledTimes(1);
	});

	it('does not send options to the question store', async () => {
		await onStatementCreated(
			created(
				statement({
					statementId: 'o1',
					statementType: 'option',
					parentId: 'q1',
					topParentId: 'q1',
				}),
			),
		);

		expect(mockEmbedNewQuestion).not.toHaveBeenCalled();
	});
});

/**
 * searchQuestionsByMeaning: auth + validation, ranking, and access scoping —
 * a question outside the caller's creator / admin scopes is never returned,
 * even when its vector is the closest one or its vector mirror is stale.
 */
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../services/__tests__/helpers/fakeFirestore').firestoreModule,
);

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('firebase-functions/v2/https', () => {
	class HttpsError extends Error {
		constructor(
			readonly code: string,
			message: string,
		) {
			super(message);
		}
	}

	return { HttpsError, onCall: (_options: unknown, handler: unknown) => handler };
});

const mockGenerateEmbedding = jest.fn();
jest.mock('../services/embedding-service', () => ({
	embeddingService: {
		generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
	},
}));

jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));

import { executeQuestionSearch } from '../fn_searchQuestionsByMeaning';
import { QUESTION_EMBEDDING_MODEL } from '../services/question-embedding-store';
import { QUESTION_SEARCH_LIMITS } from '../questionSearch/questionSearchScopes';
import { resetFirestore, seed } from '../services/__tests__/helpers/fakeFirestore';

const ME = 'me';
const QUERY_VECTOR = [1, 0, 0];

interface QuestionFixture {
	id: string;
	creatorId: string;
	parentId: string;
	topParentId: string;
	parents?: string[];
	vector: number[];
	hide?: boolean;
	statementType?: string;
}

/** A question statement and its vector doc (mirror equal to the statement). */
function questionWithVector(q: QuestionFixture): void {
	const parents = q.parents ?? (q.parentId === 'top' ? [] : [q.topParentId]);
	seed('statements', q.id, {
		statementId: q.id,
		statement: `Question ${q.id}`,
		statementType: q.statementType ?? 'question',
		creatorId: q.creatorId,
		parentId: q.parentId,
		topParentId: q.topParentId,
		parents,
		hide: q.hide,
		lastUpdate: 1,
	});
	seed('questionEmbeddings', q.id, {
		statementId: q.id,
		statementType: 'question',
		creatorId: q.creatorId,
		parentId: q.parentId,
		topParentId: q.topParentId,
		parents,
		hide: q.hide === true,
		embedding: q.vector,
		embeddingModel: QUESTION_EMBEDDING_MODEL,
	});
}

function adminOf(statementId: string, data: Record<string, unknown>): void {
	seed('statementsSubscribe', `${ME}--${statementId}`, {
		userId: ME,
		statementId,
		role: 'admin',
		lastUpdate: 1,
		...data,
	});
}

async function search(data: unknown): Promise<string[]> {
	const { results } = await executeQuestionSearch(ME, data);

	return results.map((result) => result.statementId);
}

beforeEach(() => {
	resetFirestore();
	mockGenerateEmbedding.mockReset();
	mockGenerateEmbedding.mockResolvedValue({ embedding: QUERY_VECTOR });
});

describe('auth and validation', () => {
	it('requires sign-in', async () => {
		await expect(executeQuestionSearch(undefined, { query: 'parks' })).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it.each([
		[{}],
		[{ query: 'ab' }],
		[{ query: '   ab   ' }],
		[{ query: 'x'.repeat(201) }],
		[{ query: 'parks', limit: 0 }],
		[{ query: 'parks', limit: 51 }],
		[{ query: 'parks', limit: 2.5 }],
		[{ query: 42 }],
		['parks'],
	])('rejects %j', async (data) => {
		await expect(executeQuestionSearch(ME, data)).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		expect(mockGenerateEmbedding).not.toHaveBeenCalled();
	});

	it('embeds the trimmed query once, with the fixed question model and no brief', async () => {
		await search({ query: '  park budget  ' });

		expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
		expect(mockGenerateEmbedding).toHaveBeenCalledWith('park budget', undefined, {
			model: QUESTION_EMBEDDING_MODEL,
			skipBrief: true,
		});
	});
});

describe('ranking', () => {
	it('returns my questions best match first, with similarity and tree ids', async () => {
		questionWithVector({
			id: 'far',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'far',
			vector: [0.6, 0.8, 0],
		});
		questionWithVector({
			id: 'near',
			creatorId: ME,
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0.1, 0],
		});

		const { results } = await executeQuestionSearch(ME, { query: 'park budget' });

		expect(results.map((r) => r.statementId)).toEqual(['near', 'far']);
		expect(results[0]).toMatchObject({
			statement: 'Question near',
			parentId: 'g1',
			topParentId: 'g1',
		});
		expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
		expect(results[0].similarity).toBeLessThanOrEqual(1);
	});

	it('drops hits below the similarity floor', async () => {
		questionWithVector({
			id: 'orthogonal',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'orthogonal',
			vector: [0, 1, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it('dedupes a question found by both the creator and the admin scope', async () => {
		adminOf('g1', { parentId: 'top', topParentId: 'g1' });
		questionWithVector({
			id: 'q1',
			creatorId: ME,
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual(['q1']);
	});

	it('honours the limit', async () => {
		for (let i = 0; i < 5; i++) {
			questionWithVector({
				id: `q${i}`,
				creatorId: ME,
				parentId: 'top',
				topParentId: `q${i}`,
				vector: [1, i / 10, 0],
			});
		}

		expect(await search({ query: 'park budget', limit: 2 })).toEqual(['q0', 'q1']);
	});
});

describe('access scoping', () => {
	it("never returns someone else's question outside my admin trees, even the closest one", async () => {
		questionWithVector({
			id: 'theirs',
			creatorId: 'bob',
			parentId: 'g9',
			topParentId: 'g9',
			vector: [1, 0, 0],
		});
		questionWithVector({
			id: 'mine',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'mine',
			vector: [0.8, 0.6, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual(['mine']);
	});

	it('includes every question in a tree I administer at the top', async () => {
		adminOf('g1', { parentId: 'top', topParentId: 'g1' });
		questionWithVector({
			id: 'bobs',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual(['bobs']);
	});

	it('still searches a tree whose admin subscription has no lastUpdate', async () => {
		seed('statementsSubscribe', `${ME}--g1`, {
			userId: ME,
			statementId: 'g1',
			role: 'admin',
			parentId: 'top',
			topParentId: 'g1',
		});
		questionWithVector({
			id: 'bobs',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual(['bobs']);
	});

	it('limits a nested admin role to its own sub-tree', async () => {
		// Admin of sub-question s1 inside g1 — not of g1 itself.
		adminOf('s1', { parentId: 'g1', topParentId: 'g1' });
		questionWithVector({
			id: 's1',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			parents: ['g1'],
			vector: [1, 0, 0],
		});
		questionWithVector({
			id: 'under',
			creatorId: 'bob',
			parentId: 's1',
			topParentId: 'g1',
			parents: ['g1', 's1'],
			vector: [1, 0.05, 0],
		});
		questionWithVector({
			id: 'sibling',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			parents: ['g1'],
			vector: [1, 0.01, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual(['s1', 'under']);
	});

	it('ignores non-admin roles', async () => {
		for (const role of ['member', 'waiting', 'banned', 'statement-creator']) {
			seed('statementsSubscribe', `${ME}--g-${role}`, {
				userId: ME,
				statementId: `g-${role}`,
				role,
				parentId: 'top',
				topParentId: `g-${role}`,
				lastUpdate: 1,
			});
			questionWithVector({
				id: `q-${role}`,
				creatorId: 'bob',
				parentId: `g-${role}`,
				topParentId: `g-${role}`,
				vector: [1, 0, 0],
			});
		}

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it("ignores another user's admin subscriptions", async () => {
		seed('statementsSubscribe', 'bob--g1', {
			userId: 'bob',
			statementId: 'g1',
			role: 'admin',
			parentId: 'top',
			topParentId: 'g1',
			lastUpdate: 1,
		});
		questionWithVector({
			id: 'q1',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it('re-checks the live statement: a stale mirror cannot leak a moved question', async () => {
		adminOf('g1', { parentId: 'top', topParentId: 'g1' });
		questionWithVector({
			id: 'moved',
			creatorId: 'bob',
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
		});
		// The statement moved to a tree I do not administer; the vector doc did not follow yet.
		seed('statements', 'moved', {
			statementId: 'moved',
			statement: 'Moved',
			statementType: 'question',
			creatorId: 'bob',
			parentId: 'g9',
			topParentId: 'g9',
			parents: ['g9'],
			lastUpdate: 2,
		});

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it('excludes hidden questions (on the mirror or on the live statement)', async () => {
		questionWithVector({
			id: 'hidden',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'hidden',
			vector: [1, 0, 0],
			hide: true,
		});
		questionWithVector({
			id: 'liveHidden',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'liveHidden',
			vector: [1, 0, 0],
		});
		seed('statements', 'liveHidden', {
			statementId: 'liveHidden',
			statement: 'Hidden now',
			statementType: 'question',
			creatorId: ME,
			parentId: 'top',
			topParentId: 'liveHidden',
			hide: true,
			lastUpdate: 2,
		});

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it('excludes deleted statements and statements that are no longer questions', async () => {
		questionWithVector({
			id: 'nowOption',
			creatorId: ME,
			parentId: 'g1',
			topParentId: 'g1',
			vector: [1, 0, 0],
			statementType: 'option',
		});
		seed('questionEmbeddings', 'gone', {
			statementId: 'gone',
			creatorId: ME,
			topParentId: 'gone',
			parents: [],
			embedding: [1, 0, 0],
		});

		expect(await search({ query: 'park budget' })).toEqual([]);
	});

	it(`searches at most ${QUESTION_SEARCH_LIMITS.MAX_ADMIN_TREES} admin trees, the most recent`, async () => {
		const trees = QUESTION_SEARCH_LIMITS.MAX_ADMIN_TREES + 2;
		for (let i = 0; i < trees; i++) {
			adminOf(`g${i}`, { parentId: 'top', topParentId: `g${i}`, lastUpdate: i });
			questionWithVector({
				id: `q${i}`,
				creatorId: 'bob',
				parentId: `g${i}`,
				topParentId: `g${i}`,
				vector: [1, 0, 0],
			});
		}

		const found = await search({ query: 'park budget', limit: 50 });

		expect(found).toHaveLength(QUESTION_SEARCH_LIMITS.MAX_ADMIN_TREES);
		expect(found).not.toContain('q0');
		expect(found).not.toContain('q1');
	});
});

describe('failures', () => {
	it('maps an embedding failure to internal', async () => {
		mockGenerateEmbedding.mockRejectedValue(new Error('OpenAI down'));

		await expect(executeQuestionSearch(ME, { query: 'park budget' })).rejects.toMatchObject({
			code: 'internal',
		});
	});
});

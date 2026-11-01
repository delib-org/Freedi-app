/**
 * question-embedding-store: which statements are embeddable questions, the
 * fixed model, idempotent upserts, and the update-trigger sync.
 */
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/fakeFirestore').firestoreModule,
);

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockEmbed = jest.fn();
jest.mock('../embedding-service', () => ({
	embeddingService: {
		generateEmbeddingWithRetry: (...args: unknown[]) => mockEmbed(...args),
	},
}));

jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import {
	QUESTION_EMBEDDING_MODEL,
	QUESTION_EMBED_MAX_CHARS,
	buildQuestionEmbeddingText,
	deleteQuestionEmbedding,
	embedNewQuestion,
	resolveTopParentId,
	syncQuestionEmbedding,
	toQuestionSource,
	upsertQuestionEmbedding,
	type QuestionSource,
} from '../question-embedding-store';
import { peek, resetFirestore, seed } from './helpers/fakeFirestore';

const VECTORS = 'questionEmbeddings';

function question(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		statementId: 'q1',
		statement: 'How should we spend the park budget?',
		statementType: 'question',
		creatorId: 'alice',
		creator: { uid: 'alice' },
		parentId: 'g1',
		topParentId: 'g1',
		parents: ['g1'],
		lastUpdate: 1,
		...overrides,
	};
}

function sourceOf(data: Record<string, unknown>): QuestionSource {
	const source = toQuestionSource(data);
	if (!source) throw new Error('fixture is not an embeddable question');

	return source;
}

beforeEach(() => {
	resetFirestore();
	mockEmbed.mockReset();
	mockEmbed.mockResolvedValue({ embedding: [1, 0, 0], model: QUESTION_EMBEDDING_MODEL });
});

describe('toQuestionSource', () => {
	it('accepts a question and mirrors its scope fields', () => {
		expect(toQuestionSource(question({ hide: true }))).toEqual({
			statementId: 'q1',
			statement: 'How should we spend the park budget?',
			description: undefined,
			creatorId: 'alice',
			parentId: 'g1',
			topParentId: 'g1',
			parents: ['g1'],
			hide: true,
		});
	});

	it('rejects options, short text and missing ids', () => {
		expect(toQuestionSource(question({ statementType: 'option' }))).toBeNull();
		expect(toQuestionSource(question({ statement: 'ab' }))).toBeNull();
		expect(toQuestionSource(question({ statementId: '' }))).toBeNull();
		expect(toQuestionSource(question({ creatorId: undefined, creator: undefined }))).toBeNull();
		expect(toQuestionSource(null)).toBeNull();
	});

	it('falls back to creator.uid when creatorId is absent', () => {
		expect(toQuestionSource(question({ creatorId: undefined }))?.creatorId).toBe('alice');
	});
});

describe('resolveTopParentId', () => {
	it('makes a top-level question its own tree', () => {
		expect(resolveTopParentId('q1', 'top', 'something-else')).toBe('q1');
		expect(resolveTopParentId('q1', 'top', undefined)).toBe('q1');
	});

	it("ignores the legacy 'top' value and falls back to the parent", () => {
		expect(resolveTopParentId('q1', 'p1', 'top')).toBe('p1');
		expect(resolveTopParentId('q1', 'p1', 'g1')).toBe('g1');
	});
});

describe('buildQuestionEmbeddingText', () => {
	it('joins title and description and caps the length', () => {
		const source = toQuestionSource(question({ description: 'More detail' }));
		expect(source && buildQuestionEmbeddingText(source)).toBe(
			'How should we spend the park budget?\nMore detail',
		);

		const long = toQuestionSource(question({ description: 'x'.repeat(5000) }));
		expect(long && buildQuestionEmbeddingText(long).length).toBe(QUESTION_EMBED_MAX_CHARS);
	});
});

describe('upsertQuestionEmbedding', () => {
	it('embeds with the fixed model, no context and no brief', async () => {
		const source = toQuestionSource(question());
		if (!source) throw new Error('fixture');

		await expect(upsertQuestionEmbedding(source)).resolves.toBe('embedded');

		expect(mockEmbed).toHaveBeenCalledWith(source.statement, undefined, 3, {
			model: QUESTION_EMBEDDING_MODEL,
			skipBrief: true,
		});
		const stored = peek(VECTORS, 'q1');
		expect(stored).toMatchObject({
			statementType: 'question',
			creatorId: 'alice',
			topParentId: 'g1',
			embeddingModel: QUESTION_EMBEDDING_MODEL,
		});
		expect(typeof stored?.lastUpdate).toBe('number');
	});

	it('is idempotent: unchanged text is never re-embedded', async () => {
		const source = toQuestionSource(question());
		if (!source) throw new Error('fixture');

		await upsertQuestionEmbedding(source);
		await expect(upsertQuestionEmbedding(source)).resolves.toBe('unchanged');
		expect(mockEmbed).toHaveBeenCalledTimes(1);
	});

	it('refreshes drifted scope fields without calling OpenAI', async () => {
		const source = toQuestionSource(question());
		if (!source) throw new Error('fixture');
		await upsertQuestionEmbedding(source);

		await expect(upsertQuestionEmbedding({ ...source, hide: true })).resolves.toBe('synced');
		expect(mockEmbed).toHaveBeenCalledTimes(1);
		expect(peek(VECTORS, 'q1')?.hide).toBe(true);
	});

	it('dry run writes nothing and calls nothing', async () => {
		const source = toQuestionSource(question());
		if (!source) throw new Error('fixture');

		await expect(upsertQuestionEmbedding(source, { dryRun: true })).resolves.toBe('embedded');
		expect(mockEmbed).not.toHaveBeenCalled();
		expect(peek(VECTORS, 'q1')).toBeUndefined();
	});
});

describe('embedNewQuestion (creation trigger branch)', () => {
	it('embeds a top-level question', async () => {
		await embedNewQuestion(question({ statementId: 'g1', parentId: 'top', topParentId: 'g1' }));

		expect(peek(VECTORS, 'g1')?.topParentId).toBe('g1');
	});

	it('ignores options', async () => {
		await embedNewQuestion(question({ statementType: 'option' }));

		expect(mockEmbed).not.toHaveBeenCalled();
	});

	it('never throws when OpenAI fails', async () => {
		mockEmbed.mockRejectedValue(new Error('rate limited'));

		await expect(embedNewQuestion(question())).resolves.toBeUndefined();
		expect(peek(VECTORS, 'q1')).toBeUndefined();
	});
});

describe('syncQuestionEmbedding (update trigger)', () => {
	it('does nothing for a vote-only update', async () => {
		const before = question();
		await syncQuestionEmbedding(before, { ...before, consensus: 0.4, lastUpdate: 2 });

		expect(mockEmbed).not.toHaveBeenCalled();
		expect(peek(VECTORS, 'q1')).toBeUndefined();
	});

	it('ignores non-questions entirely', async () => {
		const before = question({ statementType: 'option' });
		await syncQuestionEmbedding(before, { ...before, statement: 'Something new here' });

		expect(mockEmbed).not.toHaveBeenCalled();
	});

	it('re-embeds on a text edit', async () => {
		const before = question();
		await upsertQuestionEmbedding(sourceOf(before));
		await syncQuestionEmbedding(before, { ...before, statement: 'Where should the new park go?' });

		expect(mockEmbed).toHaveBeenCalledTimes(2);
	});

	it('follows a move without re-embedding', async () => {
		const before = question();
		await upsertQuestionEmbedding(sourceOf(before));
		await syncQuestionEmbedding(before, {
			...before,
			parentId: 'g2',
			topParentId: 'g2',
			parents: ['g2'],
		});

		expect(mockEmbed).toHaveBeenCalledTimes(1);
		expect(peek(VECTORS, 'q1')?.topParentId).toBe('g2');
	});

	it('drops the vector when the statement stops being a question', async () => {
		const before = question();
		await upsertQuestionEmbedding(sourceOf(before));
		await syncQuestionEmbedding(before, { ...before, statementType: 'option' });

		expect(peek(VECTORS, 'q1')).toBeUndefined();
	});
});

describe('deleteQuestionEmbedding', () => {
	it('removes the vector doc', async () => {
		seed(VECTORS, 'q1', { statementId: 'q1' });
		await deleteQuestionEmbedding('q1');

		expect(peek(VECTORS, 'q1')).toBeUndefined();
	});
});

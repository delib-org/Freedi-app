import {
	object,
	string,
	number,
	optional,
	array,
	literal,
	boolean,
	pipe,
	trim,
	minLength,
	maxLength,
	integer,
	minValue,
	maxValue,
	InferOutput,
} from 'valibot';

/**
 * "Search by meaning" for questions — the `searchQuestionsByMeaning` callable.
 *
 * An admin types a phrase (e.g. in the Mass Consensus survey question picker)
 * and gets QUESTION statements ranked by meaning. The search only ever looks
 * at questions the caller created, or questions in statements where the
 * caller holds the admin role. Vectors are server-only
 * (`questionEmbeddings/{statementId}`), so clients cannot rank locally.
 */
export const QUESTION_SEARCH_CONFIG = {
	/** Shorter queries return nothing: the query is embedded, so wait for a word. */
	MIN_QUERY_LENGTH: 3,
	MAX_QUERY_LENGTH: 200,
	DEFAULT_LIMIT: 20,
	MAX_LIMIT: 50,
} as const;

export const SearchQuestionsByMeaningRequestSchema = object({
	query: pipe(
		string(),
		trim(),
		minLength(QUESTION_SEARCH_CONFIG.MIN_QUERY_LENGTH),
		maxLength(QUESTION_SEARCH_CONFIG.MAX_QUERY_LENGTH),
	),
	limit: optional(
		pipe(
			number(),
			integer(),
			minValue(1),
			maxValue(QUESTION_SEARCH_CONFIG.MAX_LIMIT),
		),
	),
});

export type SearchQuestionsByMeaningRequest = InferOutput<
	typeof SearchQuestionsByMeaningRequestSchema
>;

export const QuestionMeaningMatchSchema = object({
	statementId: string(),
	/** The question's text (title). */
	statement: string(),
	parentId: string(),
	topParentId: string(),
	/** Cosine similarity, 0..1 (higher = closer in meaning). */
	similarity: number(),
});

export type QuestionMeaningMatch = InferOutput<typeof QuestionMeaningMatchSchema>;

export const SearchQuestionsByMeaningResponseSchema = object({
	/** Best match first. */
	results: array(QuestionMeaningMatchSchema),
});

export type SearchQuestionsByMeaningResponse = InferOutput<
	typeof SearchQuestionsByMeaningResponseSchema
>;

/**
 * QuestionEmbeddingDoc — `questionEmbeddings/{statementId}`, server-only.
 *
 * Kept apart from `statementEmbeddings` on purpose: option search there
 * pre-filters by `parentId` / `topParentId`, and question vectors use one
 * fixed model for every question (so any two are comparable), unlike option
 * vectors whose model is pinned per question.
 *
 * `creatorId`, `parentId` and `topParentId` mirror the statement so
 * `findNearest` can pre-filter by access scope; the search still re-checks
 * every hit against the live statement before returning it.
 */
export const QuestionEmbeddingDocSchema = object({
	statementId: string(),
	statementType: literal('question'),
	creatorId: string(),
	parentId: string(),
	topParentId: string(),
	/** Plain-array form; stored as a Firestore VectorValue. */
	embedding: array(number()),
	embeddingModel: string(),
	/** sha1 of the text the vector was built from (skip re-embedding unchanged text). */
	textHash: string(),
	hide: optional(boolean()),
	lastUpdate: number(),
});

export type QuestionEmbeddingDoc = InferOutput<typeof QuestionEmbeddingDocSchema>;

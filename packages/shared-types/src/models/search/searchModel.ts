import {
	object,
	string,
	number,
	optional,
	literal,
	union,
	array,
	picklist,
	enum_,
	boolean,
	pipe,
	minLength,
	maxLength,
	integer,
	minValue,
	maxValue,
	InferOutput,
} from 'valibot';
import { StatementType } from '../TypeEnums';

/**
 * Statement search — shared by the main app and the `searchStatements`
 * callable, so both rank with the same scorer (utils/textSearch) and the
 * same limits.
 *
 * Scopes:
 *  - home:          the caller's top-level subscriptions
 *  - subscriptions: every statement the caller is subscribed to
 *  - tree:          everything under one top statement
 */

export const SEARCH_CONFIG = {
	/** Shorter queries return nothing (one letter matches everything). */
	MIN_QUERY_LENGTH: 2,
	MAX_QUERY_LENGTH: 200,
	/** Semantic search embeds the query, so it waits for a real word. */
	MIN_SEMANTIC_QUERY_LENGTH: 3,
	/** Lexical matches below this are noise ("tlk" → "Talk" scores ~0.7). */
	MIN_LEXICAL_SCORE: 0.45,
	/**
	 * Cosine similarity floor for "similar meaning" hits. Far below the 0.8
	 * dedup threshold: search wants recall, the dedup flow wants precision.
	 */
	MIN_SEMANTIC_SIMILARITY: 0.35,
	MAX_RESULTS: 50,
	/** Nearest neighbours fetched per embedding model under one tree. */
	SEMANTIC_LIMIT_PER_MODEL: 30,
	/** A description match counts for less than the same match in the title. */
	DESCRIPTION_WEIGHT: 0.8,
} as const;

export const SearchScopeSchema = union([
	object({ kind: literal('home') }),
	object({ kind: literal('subscriptions') }),
	object({ kind: literal('tree'), rootId: pipe(string(), minLength(1)) }),
]);

export type SearchScope = InferOutput<typeof SearchScopeSchema>;
export type SearchScopeKind = SearchScope['kind'];

/** The few fields search needs, from a statement or a subscription's copy of one. */
export const SearchCandidateSchema = object({
	statementId: string(),
	title: string(),
	description: optional(string()),
	statementType: enum_(StatementType),
	parentId: string(),
	topParentId: string(),
	lastUpdate: number(),
});

export type SearchCandidate = InferOutput<typeof SearchCandidateSchema>;

/** Half-open [start, end) range in the ORIGINAL (un-normalized) text. */
export const SearchRangeSchema = object({
	start: number(),
	end: number(),
});

export type SearchRange = InferOutput<typeof SearchRangeSchema>;

export const SearchMatchKindSchema = picklist(['lexical', 'semantic']);
export type SearchMatchKind = InferOutput<typeof SearchMatchKindSchema>;

export const SearchMatchFieldSchema = picklist(['title', 'description']);
export type SearchMatchField = InferOutput<typeof SearchMatchFieldSchema>;

export const SearchMatchSchema = object({
	candidate: SearchCandidateSchema,
	/** 0–1. Lexical: scorer confidence. Semantic: cosine similarity. */
	score: number(),
	kind: SearchMatchKindSchema,
	field: optional(SearchMatchFieldSchema),
	ranges: optional(array(SearchRangeSchema)),
});

export type SearchMatch = InferOutput<typeof SearchMatchSchema>;

export const SearchStatementsRequestSchema = object({
	scope: SearchScopeSchema,
	query: pipe(string(), maxLength(SEARCH_CONFIG.MAX_QUERY_LENGTH)),
	limit: optional(pipe(number(), integer(), minValue(1), maxValue(SEARCH_CONFIG.MAX_RESULTS))),
	/** Run the lexical pass on the server (default true). */
	lexical: optional(boolean()),
	/** Run the semantic pass (tree scope only; default false). */
	semantic: optional(boolean()),
});

export type SearchStatementsRequest = InferOutput<typeof SearchStatementsRequestSchema>;

export const SearchStatementsResponseSchema = object({
	lexical: array(SearchMatchSchema),
	semantic: array(SearchMatchSchema),
	/** How many candidates the lexical pass scored, out of how many exist. */
	coverage: object({ scanned: number(), total: number() }),
	durationMs: number(),
});

export type SearchStatementsResponse = InferOutput<typeof SearchStatementsResponseSchema>;

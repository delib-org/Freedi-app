import { logger } from 'firebase-functions';
import { Statement, SimilaritySearchMethod } from '@freedi/shared-types';
import {
	getUserStatements,
	convertToSimpleStatements,
	getStatementsByIds,
	removeDuplicateStatement,
	hasReachedMaxStatements,
} from './statement-service';
import { getCachedSubStatements } from './cached-statement-service';
import {
	getCachedSimilarStatementIds,
	getCachedSimilarityResponse,
	saveCachedSimilarityResponse,
} from './cached-ai-service';
import { vectorSearchService } from './vector-search-service';
import { embeddingCache } from './embedding-cache-service';
import { generateParaphrases } from './paraphrase-service';

/**
 * The interactive "is there already a suggestion like mine?" search, shared by
 * the standalone findSimilarStatements function and the combined
 * prepareSuggestion function.
 *
 * Latency shape (the participant is waiting on this):
 *
 *   first pass   raw text → embedding → findNearest          ~0.3 s
 *   expansions   brief → embedding → findNearest             ~1.7 s  } started
 *                paraphrases → 2 × (brief → embed → search)  ~3.5 s  } at t=0
 *
 * The first pass embeds the text as typed, with no LLM in front of it. Passes
 * are settled in order of cost: the first pass answers when it has a match at
 * or above the threshold; otherwise the brief-based search answers when it
 * has one; only when both miss do we wait for the paraphrase round. Every
 * pass is already in flight by then, so a miss costs the slowest pass we had
 * to wait for and not the passes before it on top.
 *
 * Stored vectors come from LLM briefs, so the raw-text first pass can score a
 * true match a little lower than the brief-based search would. A raw-text
 * miss therefore means "not sure yet", never "nothing similar": the expansions
 * keep the previous recall.
 */

const DEFAULT_LIMIT = 5;
const MIN_EMBEDDING_COVERAGE_PERCENT = 50;
const PARAPHRASE_COUNT = 2;
/** Fewer direct hits than this, on a question this big, adds the LLM id search. */
const LLM_SUPPLEMENT_BELOW = 3;
const LLM_SUPPLEMENT_MIN_STATEMENTS = 10;

export interface SimilaritySearchInput {
	questionId: string;
	userInput: string;
	creatorId: string;
	parentStatement: Statement;
	threshold: number;
	limit?: number;
	/**
	 * Raw and brief passes only, no paraphrase round. For lookups that need a
	 * confident merge target more than a wide net, such as the pieces of a
	 * split submission.
	 */
	quick?: boolean;
}

export type StatementWithSimilarity = Statement & { similarity: number | null };

export interface SimilaritySearchResult {
	ok: true;
	similarStatements: StatementWithSimilarity[];
	userText: string;
	method: SimilaritySearchMethod;
	cached: boolean;
}

export interface SimilaritySearchFailure {
	ok: false;
	error: string;
	statusCode: number;
}

export type SimilaritySearchOutcome = SimilaritySearchResult | SimilaritySearchFailure;

interface ScoredHit {
	statementId: string;
	similarity: number;
}

/** The first pass is final as soon as it has one match at or above the threshold. */
export function firstPassIsEnough(firstPassHits: number): boolean {
	return firstPassHits > 0;
}

/**
 * Merge hits from several searches, keeping the best similarity per statement
 * and the first-seen order for ties. Exported for tests.
 */
export function mergeHits(...passes: ScoredHit[][]): ScoredHit[] {
	const best = new Map<string, number>();
	for (const pass of passes) {
		for (const hit of pass) {
			const current = best.get(hit.statementId);
			if (current === undefined || hit.similarity > current) {
				best.set(hit.statementId, hit.similarity);
			}
		}
	}

	return [...best.entries()].map(([statementId, similarity]) => ({ statementId, similarity }));
}

/** Read the similarity threshold an admin set on the question, or the default. */
export function thresholdFor(parentStatement: Statement): number {
	const settings = parentStatement.statementSettings as Record<string, unknown> | undefined;
	const value = settings?.similarityThreshold;

	return typeof value === 'number' ? value : 0.8;
}

async function vectorHits(
	text: string,
	input: SimilaritySearchInput,
	limit: number,
	skipBrief: boolean,
): Promise<ScoredHit[]> {
	const results = await vectorSearchService.findSimilarToText(
		text,
		input.questionId,
		input.parentStatement.statement,
		{ limit, threshold: input.threshold, skipBrief },
	);

	return results.map((r) => ({ statementId: r.statement.statementId, similarity: r.similarity }));
}

/** Never lets a background expansion reject after the caller has moved on. */
function quiet<T>(promise: Promise<T>, fallback: T, what: string): Promise<T> {
	return promise.catch((error: unknown) => {
		logger.warn(`${what} failed (non-fatal)`, {
			error: error instanceof Error ? error.message : String(error),
		});

		return fallback;
	});
}

export async function searchSimilarStatements(
	input: SimilaritySearchInput,
): Promise<SimilaritySearchOutcome> {
	const { questionId, userInput, creatorId, parentStatement, threshold } = input;
	const limit = input.limit ?? DEFAULT_LIMIT;

	const cached = await getCachedSimilarityResponse(questionId, userInput, creatorId, threshold);
	if (cached) {
		logger.info('Similarity search: full cache hit', { questionId });

		return {
			ok: true,
			similarStatements: cached.similarStatements as StatementWithSimilarity[],
			userText: cached.userText,
			method: 'embedding',
			cached: true,
		};
	}

	// Everything below starts at once. The Firestore reads and the first-pass
	// embedding do not depend on each other, and the expansions are the fallback
	// for a first-pass miss, so waiting to start them would put their whole
	// latency on the miss path.
	const subStatementsPromise = getCachedSubStatements(questionId);
	const coveragePromise = quiet(
		embeddingCache.getEmbeddingCoverage(questionId),
		{ totalStatements: 0, withEmbeddings: 0, withoutEmbeddings: 0, coveragePercent: 0 },
		'Embedding coverage',
	);
	const firstPassPromise = quiet(
		vectorHits(userInput, input, limit, true),
		null,
		'First-pass search',
	);
	const briefPassPromise = quiet(vectorHits(userInput, input, limit, false), [], 'Brief search');
	const paraphrasePassPromise: Promise<ScoredHit[]> = input.quick
		? Promise.resolve([])
		: quiet(
				generateParaphrases(userInput, parentStatement.statement, PARAPHRASE_COUNT).then(
					async (paraphrases) => {
						if (paraphrases.length === 0) return [] as ScoredHit[];
						const passes = await Promise.all(
							paraphrases.map((p) =>
								quiet(vectorHits(p, input, limit, false), [], 'Paraphrase search'),
							),
						);

						return mergeHits(...passes);
					},
				),
				[],
				'Paraphrase expansion',
			);

	try {
		const [subStatements, coverage] = await Promise.all([subStatementsPromise, coveragePromise]);

		const maxAllowed =
			(parentStatement.statementSettings?.numberOfOptionsPerUser as number | undefined) ?? Infinity;
		if (hasReachedMaxStatements(getUserStatements(subStatements, creatorId), maxAllowed)) {
			return {
				ok: false,
				error: 'You have reached the maximum number of suggestions allowed.',
				statusCode: 403,
			};
		}

		const statementsWithIds = () =>
			convertToSimpleStatements(subStatements).map((s) => ({ id: s.id, text: s.statement }));

		let hits: ScoredHit[] = [];
		let method: SimilaritySearchMethod = 'embedding';

		if (coverage.coveragePercent >= MIN_EMBEDDING_COVERAGE_PERCENT) {
			const firstPass = await firstPassPromise;

			if (firstPass !== null && firstPassIsEnough(firstPass.length)) {
				hits = firstPass;
				logger.info('Similarity search: first pass answered', {
					questionId,
					hits: hits.length,
					top: hits[0]?.similarity,
				});
			} else {
				const briefPass = await briefPassPromise;
				if (briefPass.length > 0) {
					hits = mergeHits(firstPass ?? [], briefPass);
					logger.info('Similarity search: brief pass answered', {
						questionId,
						firstPassFailed: firstPass === null,
						hits: hits.length,
						top: hits[0]?.similarity,
					});
				} else {
					const paraphrasePass = await paraphrasePassPromise;
					hits = mergeHits(firstPass ?? [], paraphrasePass);
					logger.info('Similarity search: paraphrase pass answered', {
						questionId,
						firstPassFailed: firstPass === null,
						quick: input.quick === true,
						hits: hits.length,
					});
				}
			}

			if (
				hits.length < LLM_SUPPLEMENT_BELOW &&
				subStatements.length > LLM_SUPPLEMENT_MIN_STATEMENTS
			) {
				method = 'hybrid';
				const llmIds = await getCachedSimilarStatementIds(
					statementsWithIds(),
					userInput,
					parentStatement.statement,
					limit - hits.length,
				);
				const seen = new Set(hits.map((h) => h.statementId));
				for (const id of llmIds) {
					if (!seen.has(id)) hits.push({ statementId: id, similarity: -1 });
				}
			}
		} else {
			logger.info('Similarity search: low embedding coverage, LLM only', {
				questionId,
				coveragePercent: coverage.coveragePercent,
			});
			method = 'llm';
			const llmIds = await getCachedSimilarStatementIds(
				statementsWithIds(),
				userInput,
				parentStatement.statement,
				limit,
			);
			hits = llmIds.map((statementId) => ({ statementId, similarity: -1 }));
		}

		// Expansions can push past the limit; keep the strongest. Unscored LLM
		// ids (-1) rank last.
		const ranked = [...hits].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
		const scores = new Map(ranked.map((h) => [h.statementId, h.similarity]));

		const { statements: cleaned, duplicateStatement } = removeDuplicateStatement(
			getStatementsByIds(
				ranked.map((h) => h.statementId),
				subStatements,
			),
			userInput,
		);

		const similarStatements: StatementWithSimilarity[] = cleaned.map((statement) => {
			const score = scores.get(statement.statementId);

			return { ...statement, similarity: score === undefined || score < 0 ? null : score };
		});
		const userText = duplicateStatement?.statement || userInput;

		// The cache write is for the next request; this one does not wait for it.
		saveCachedSimilarityResponse(
			questionId,
			userInput,
			creatorId,
			{ similarStatements, userText },
			threshold,
		).catch(() => {
			/* logged inside */
		});

		return { ok: true, similarStatements, userText, method, cached: false };
	} catch (error) {
		logger.error('Similarity search failed', {
			questionId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { ok: false, error: 'Failed to process data', statusCode: 500 };
	}
}

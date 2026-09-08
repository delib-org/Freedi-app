import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import {
	checkForInappropriateContent,
	detectAndSplitMultipleSuggestions,
	DetectedSuggestion,
} from './services/ai-service';
import { getCachedParentStatement } from './services/cached-statement-service';
import {
	searchSimilarStatements,
	thresholdFor,
	SimilaritySearchOutcome,
	SimilaritySearchResult,
} from './services/similarity-search-service';
import { logModerationRejection } from './services/moderation-log-service';

/**
 * Cloud Function: everything the "Add your idea" flow needs to know about a
 * submission, in one round trip.
 *
 * Replaces the pair detectMultipleSuggestions + findSimilarStatements that
 * the Mass Consensus client used to call side by side. One request means one
 * cold start instead of two, one moderation call instead of two, one question
 * read, and the split detection and the similarity search run in parallel
 * inside the instance. With `checkPieces`, each detected piece also gets its
 * own similarity result, so an auto-merge client needs no further lookups.
 *
 * Moderation runs alongside the work and is applied last; a flagged
 * submission gets a 400 and its results are discarded.
 */

interface PrepareSuggestionRequest {
	questionId: string;
	userInput: string;
	userId: string;
	/** Also search similar suggestions for each detected piece. */
	checkPieces?: boolean;
}

export interface PieceSimilarity {
	similarStatements: SimilaritySearchResult['similarStatements'];
	userText: string;
}

export interface PrepareSuggestionResponse {
	ok: boolean;
	multi: {
		isMultipleSuggestions: boolean;
		suggestions: DetectedSuggestion[];
	};
	similar: {
		similarStatements: SimilaritySearchResult['similarStatements'];
		userText: string;
		method: SimilaritySearchResult['method'];
		cached: boolean;
	};
	/** Aligned with `multi.suggestions`; present only when `checkPieces` was set and pieces were found. */
	pieces?: PieceSimilarity[];
	/** Moderation could not run and the text was let through for later review. */
	flaggedForReview?: boolean;
	responseTime: number;
	error?: string;
	reason?: string;
	category?: string;
}

const pieceText = (piece: DetectedSuggestion): string => `${piece.title}: ${piece.description}`;

const emptyPiece = (text: string): PieceSimilarity => ({ similarStatements: [], userText: text });

function pieceFromOutcome(outcome: SimilaritySearchOutcome, text: string): PieceSimilarity {
	return outcome.ok
		? { similarStatements: outcome.similarStatements, userText: outcome.userText }
		: emptyPiece(text);
}

export async function prepareSuggestion(request: Request, response: Response): Promise<void> {
	const startTime = Date.now();
	const fail = (status: number, body: Partial<PrepareSuggestionResponse>) => {
		response.status(status).send({
			ok: false,
			multi: { isMultipleSuggestions: false, suggestions: [] },
			similar: { similarStatements: [], userText: '', method: 'embedding', cached: false },
			responseTime: Date.now() - startTime,
			...body,
		} as PrepareSuggestionResponse);
	};

	try {
		const { questionId, userInput, userId, checkPieces } = request.body as PrepareSuggestionRequest;

		if (!questionId || !userId || !userInput || typeof userInput !== 'string') {
			fail(400, { error: 'Missing required fields: questionId, userInput and userId' });

			return;
		}

		logger.info('prepareSuggestion request', {
			questionId,
			userId,
			userInputLength: userInput.length,
			checkPieces: checkPieces === true,
		});

		const moderationPromise = checkForInappropriateContent(userInput);

		const parentStatement = await getCachedParentStatement(questionId);
		if (!parentStatement) {
			fail(404, { error: 'Parent statement not found' });

			return;
		}

		const threshold = thresholdFor(parentStatement);
		const search = (text: string) =>
			searchSimilarStatements({
				questionId,
				userInput: text,
				creatorId: userId,
				parentStatement,
				threshold,
			});

		const [multi, similar] = await Promise.all([
			detectAndSplitMultipleSuggestions(userInput, parentStatement.statement || ''),
			search(userInput),
		]);

		let pieces: PieceSimilarity[] | undefined;
		if (checkPieces && multi.isMultiple && multi.suggestions.length > 1) {
			const outcomes = await Promise.all(multi.suggestions.map((s) => search(pieceText(s))));
			pieces = outcomes.map((outcome, i) =>
				pieceFromOutcome(outcome, pieceText(multi.suggestions[i])),
			);
		}

		const contentCheck = await moderationPromise;

		if (contentCheck.isInappropriate) {
			logger.warn('Inappropriate content detected in prepareSuggestion', { userId });
			const reason =
				contentCheck.reason || "This didn't quite fit here. Please rephrase and try again.";
			const category = contentCheck.category || 'other';

			logModerationRejection({
				originalText: userInput,
				reason,
				category,
				userId,
				parentId: questionId,
				topParentId: questionId,
				blockedBySafetyFilter: contentCheck.error?.includes('safety filters') || false,
			}).catch(() => {
				/* non-blocking */
			});

			fail(400, { error: 'Input contains inappropriate content', reason, category });

			return;
		}

		if (!similar.ok) {
			fail(similar.statusCode, { error: similar.error });

			return;
		}

		const responseTime = Date.now() - startTime;
		logger.info('prepareSuggestion completed', {
			questionId,
			isMultiple: multi.isMultiple,
			pieces: multi.suggestions.length,
			similar: similar.similarStatements.length,
			method: similar.method,
			cached: similar.cached,
			responseTime,
		});

		const body: PrepareSuggestionResponse = {
			ok: true,
			multi: { isMultipleSuggestions: multi.isMultiple, suggestions: multi.suggestions },
			similar: {
				similarStatements: similar.similarStatements,
				userText: similar.userText,
				method: similar.method,
				cached: similar.cached,
			},
			...(pieces ? { pieces } : {}),
			...(contentCheck.error ? { flaggedForReview: true } : {}),
			responseTime,
		};
		response.status(200).send(body);
	} catch (error) {
		logger.error('Error in prepareSuggestion:', {
			error: error instanceof Error ? error.message : String(error),
			responseTime: Date.now() - startTime,
		});
		fail(500, { error: 'Internal server error' });
	}
}

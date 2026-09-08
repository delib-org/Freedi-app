import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import { checkForInappropriateContent } from './services/ai-service';
import { getCachedParentStatement } from './services/cached-statement-service';
import { searchSimilarStatements, thresholdFor } from './services/similarity-search-service';
import { logModerationRejection } from './services/moderation-log-service';

/**
 * Cloud Function: find existing suggestions similar to the user's input.
 *
 * Moderation runs alongside the search rather than in front of it — its
 * verdict is applied when everything is back, so a clean submission (the
 * overwhelming majority) never waits for it. The search work done for a
 * flagged submission is discarded. Moderation is never cached.
 */
export async function findSimilarStatements(request: Request, response: Response) {
	const startTime = Date.now();

	try {
		const { statementId, userInput, creatorId } = request.body;

		if (!statementId || !userInput || typeof userInput !== 'string') {
			response.status(400).send({ ok: false, error: 'Missing required fields' });

			return;
		}

		logger.info('findSimilarStatements request', {
			statementId,
			userInputLength: userInput.length,
			creatorId,
		});

		const moderationPromise = checkForInappropriateContent(userInput);

		const parentStatement = await getCachedParentStatement(statementId);
		if (!parentStatement) {
			logger.error('Parent statement not found', { statementId });
			response.status(404).send({ ok: false, error: 'Parent statement not found' });

			return;
		}

		const threshold = thresholdFor(parentStatement);
		const [result, contentCheck] = await Promise.all([
			searchSimilarStatements({
				questionId: statementId,
				userInput,
				creatorId,
				parentStatement,
				threshold,
			}),
			moderationPromise,
		]);

		if (contentCheck.isInappropriate) {
			logger.warn('Inappropriate content detected', { creatorId });
			const reason =
				contentCheck.reason || "This didn't quite fit here. Please rephrase and try again.";

			logModerationRejection({
				originalText: userInput,
				reason,
				category: contentCheck.category || 'other',
				userId: creatorId,
				parentId: statementId,
				topParentId: statementId,
				blockedBySafetyFilter: contentCheck.error?.includes('safety filters') || false,
			}).catch(() => {
				/* non-blocking */
			});

			response.status(400).send({
				ok: false,
				error: 'Input contains inappropriate content',
				reason,
				category: contentCheck.category || 'other',
			});

			return;
		}

		if (contentCheck.error) {
			logger.warn('Content check had error, allowing through', {
				creatorId,
				error: contentCheck.error,
			});
		}

		if (!result.ok) {
			logger.error('Processing error', { error: result.error, statusCode: result.statusCode });
			response.status(result.statusCode).send({ ok: false, error: result.error });

			return;
		}

		const responseTime = Date.now() - startTime;
		logger.info('Request completed', {
			responseTime,
			type: result.cached ? 'full_cache_hit' : 'computed',
			similarStatementsCount: result.similarStatements.length,
			searchMethod: result.method,
		});

		response.status(200).send({
			ok: true,
			similarStatements: result.similarStatements,
			userText: result.userText,
			method: result.method,
			cached: result.cached,
			responseTime,
		});
	} catch (error) {
		const errorDetails =
			error instanceof Error
				? { message: error.message, stack: error.stack, name: error.name }
				: { message: String(error) };
		logger.error('Error in findSimilarStatements:', {
			...errorDetails,
			responseTime: Date.now() - startTime,
		});

		response.status(500).send({ ok: false, error: 'Internal server error' });
	}
}

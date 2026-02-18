import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import { checkForInappropriateContent } from './services/ai-service';
import {
	getUserStatements,
	convertToSimpleStatements,
	getStatementsFromTexts,
	removeDuplicateStatement,
	hasReachedMaxStatements,
} from './services/statement-service';
import {
	getCachedParentStatement,
	getCachedSubStatements,
} from './services/cached-statement-service';
import {
	getCachedSimilarStatements,
	getCachedSimilarityResponse,
	saveCachedSimilarityResponse,
} from './services/cached-ai-service';

/**
 * Optimized Cloud Function to find or generate similar statements.
 * Features:
 * - Parallel database operations
 * - Firestore-based caching for statements
 * - AI response caching
 * - Complete response caching
 */
export async function findSimilarStatementsOptimized(request: Request, response: Response) {
	const startTime = Date.now();

	try {
		const numberOfOptionsToGenerate = 5;
		const { statementId, userInput, creatorId } = request.body;

		// Log request for monitoring
		logger.info('findSimilarStatements request', {
			statementId,
			userInputLength: userInput?.length,
			creatorId,
		});

		// Step 1: Check for inappropriate content (NEVER CACHE THIS!)
		const contentCheck = await checkForInappropriateContent(userInput);

		if (contentCheck.isInappropriate) {
			logger.warn('Inappropriate content detected', { creatorId });
			response.status(400).send({
				ok: false,
				error: 'Input contains inappropriate content',
			});

			return;
		}

		// Log if content check had an error but allowed through
		if (contentCheck.error) {
			logger.warn('Content check had error, allowing through', {
				creatorId,
				error: contentCheck.error,
			});
		}

		// Step 2: Try to get complete cached response
		const cachedResponse = await getCachedSimilarityResponse(statementId, userInput, creatorId);

		if (cachedResponse) {
			const cacheTime = Date.now() - startTime;
			logger.info('Returning cached response', {
				responseTime: cacheTime,
				type: 'full_cache_hit',
			});

			response.status(200).send({
				...cachedResponse,
				ok: true,
				cached: true,
				responseTime: cacheTime,
			});

			return;
		}

		// Step 3: Parallel fetch with caching
		const [parentStatement, subStatements] = await Promise.all([
			getCachedParentStatement(statementId),
			getCachedSubStatements(statementId),
		]);

		if (!parentStatement) {
			logger.error('Parent statement not found', { statementId });
			response.status(404).send({
				ok: false,
				error: 'Parent statement not found',
			});

			return;
		}

		// Prepare data for parallel processing
		const userStatements = getUserStatements(subStatements, creatorId);
		const maxAllowed = parentStatement.statementSettings?.numberOfOptionsPerUser ?? Infinity;
		const statementSimple = convertToSimpleStatements(subStatements);

		// Step 4: Parallel validation and AI processing with caching
		const [validationResult, aiSimilarStatements] = await Promise.all([
			// Validation happens synchronously
			Promise.resolve(hasReachedMaxStatements(userStatements, maxAllowed)),
			// AI processing with caching
			getCachedSimilarStatements(
				statementSimple.map((s) => s.statement),
				userInput,
				parentStatement.statement,
				numberOfOptionsToGenerate,
			),
		]);

		if (validationResult) {
			logger.warn('User reached max statements', {
				creatorId,
				userStatements: userStatements.length,
				maxAllowed,
			});

			response.status(403).send({
				ok: false,
				error: 'You have reached the maximum number of suggestions allowed.',
			});

			return;
		}

		// Step 5: Process results
		const similarStatements = getStatementsFromTexts(
			statementSimple,
			aiSimilarStatements,
			subStatements,
		);

		const { statements: cleanedStatements, duplicateStatement } = removeDuplicateStatement(
			similarStatements,
			userInput,
		);

		const result = {
			similarStatements: cleanedStatements,
			userText: duplicateStatement?.statement || userInput,
		};

		// Step 6: Cache the complete response for future requests
		await saveCachedSimilarityResponse(statementId, userInput, creatorId, result);

		const totalTime = Date.now() - startTime;
		logger.info('Request completed', {
			responseTime: totalTime,
			type: 'computed',
			similarStatementsCount: cleanedStatements.length,
		});

		response.status(200).send({
			...result,
			ok: true,
			responseTime: totalTime,
		});

		return;
	} catch (error) {
		const errorTime = Date.now() - startTime;
		logger.error('Error in findSimilarStatements:', {
			error,
			responseTime: errorTime,
		});

		response.status(500).send({
			ok: false,
			error: 'Internal server error',
		});

		return;
	}
}

/**
 * Helper function to warm up cache for frequently accessed statements
 * This could be called periodically or after significant changes
 */
export async function warmupSimilarStatementsCache(statementIds: string[]): Promise<void> {
	logger.info(`Warming up cache for ${statementIds.length} statements`);

	try {
		const warmupPromises = statementIds.map(async (statementId) => {
			const [parentStatement, subStatements] = await Promise.all([
				getCachedParentStatement(statementId),
				getCachedSubStatements(statementId),
			]);

			if (parentStatement && subStatements.length > 0) {
				logger.info(`Warmed up cache for statement ${statementId}`);
			}
		});

		await Promise.all(warmupPromises);
		logger.info('Cache warmup completed');
	} catch (error) {
		logger.error('Error during cache warmup:', error);
	}
}

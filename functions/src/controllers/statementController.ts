import { Request, Response } from 'firebase-functions/v1';
import { Statement, Collections, UserEvaluation } from '@freedi/shared-types';
import { StatementService } from '../services/statements/statementService';
import { RequestValidator } from '../utils/validation';
import { cache } from '../services/cache-service';
import { db } from '../db';

export class StatementController {
	private statementService: StatementService;

	constructor(statementService?: StatementService) {
		this.statementService = statementService || new StatementService();
	}

	/**
	 * Get user options endpoint
	 */
	async getUserOptions(req: Request, res: Response): Promise<void> {
		try {
			// Validate request parameters
			const validator = new RequestValidator();
			const userId = req.query.userId as string;
			const parentId = req.query.parentId as string;

			validator.requireString(parentId, 'parentId').requireString(userId, 'userId');

			if (!validator.isValid()) {
				res.status(400).send({
					error: validator.getErrorMessage(),
					ok: false,
				});

				return;
			}

			// Get statements from service
			const statements = await this.statementService.getUserOptions({
				userId,
				parentId,
			});

			res.send({ statements, ok: true });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Get random statements endpoint
	 */
	async getRandomStatements(req: Request, res: Response): Promise<void> {
		try {
			// Validate request parameters
			const validator = new RequestValidator();
			const parentId = req.query.parentId as string;

			validator.requireString(parentId, 'parentId');

			if (!validator.isValid()) {
				res.status(400).send({
					error: validator.getErrorMessage(),
					ok: false,
				});

				return;
			}

			// Parse optional parameters
			const limit = validator.optionalNumber(req.query.limit, 'limit', 6, 50);
			const userId = req.query.userId as string | undefined;

			// Parse excludeIds (comma-separated string)
			const excludeIdsParam = req.query.excludeIds as string;
			let excludeIds = excludeIdsParam ? excludeIdsParam.split(',').filter((id) => id.trim()) : [];

			// Fetch user's evaluated options if userId is provided
			if (userId) {
				const userEvaluationId = `${userId}--${parentId}`;
				const userEvalDoc = await db
					.collection(Collections.userEvaluations)
					.doc(userEvaluationId)
					.get();

				if (userEvalDoc.exists) {
					const userData = userEvalDoc.data() as UserEvaluation;
					// Merge evaluated IDs with excludeIds
					excludeIds = [...excludeIds, ...(userData.evaluatedOptionsIds || [])];
				}
			}

			// Check cache first (only for requests without excludeIds and userId)
			if (excludeIds.length === 0 && !userId) {
				const cacheKey = cache.generateKey('random', parentId, String(limit));
				const cachedData = await cache.get<{ statements: Statement[] }>(cacheKey);

				if (cachedData) {
					// Update view counts asynchronously (don't wait)
					this.statementService.updateStatementViewCounts(cachedData.statements);
					res.status(200).send({ ...cachedData, ok: true });

					return;
				}
			}

			// Get random statements
			const statements = await this.statementService.getRandomStatements({
				parentId,
				limit,
				excludeIds,
			});

			// Cache the result (only for requests without excludeIds and userId)
			if (excludeIds.length === 0 && !userId) {
				const cacheKey = cache.generateKey('random', parentId, String(limit));
				cache.set(cacheKey, { statements }, 2); // 2 minute TTL
			}

			// Update view counts
			await this.statementService.updateStatementViewCounts(statements);

			res.status(200).send({ statements, ok: true });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Get top statements endpoint
	 */
	async getTopStatements(req: Request, res: Response): Promise<void> {
		try {
			// Validate request parameters
			const validator = new RequestValidator();
			const parentId = req.query.parentId as string;

			validator.requireString(parentId, 'parentId');

			if (!validator.isValid()) {
				res.status(400).send({
					error: validator.getErrorMessage(),
					ok: false,
				});

				return;
			}

			// Parse optional limit
			const limit = validator.optionalNumber(req.query.limit, 'limit', 6, 50);

			// Check cache first
			const cacheKey = cache.generateKey('top', parentId, String(limit));
			const cachedData = await cache.get<{ statements: Statement[] }>(cacheKey);

			if (cachedData) {
				res.send({ ...cachedData, ok: true });

				return;
			}

			// Get top statements
			const statements = await this.statementService.getTopStatements({
				parentId,
				limit,
			});

			// Cache the result
			cache.set(cacheKey, { statements }, 5); // 5 minute TTL for top statements (changes less frequently)

			res.send({ statements, ok: true });
		} catch (error) {
			this.handleError(res, error);
		}
	}

	/**
	 * Handle errors consistently
	 */
	private handleError(res: Response, error: unknown): void {
		const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
		res.status(500).send({
			error: errorMessage,
			ok: false,
		});
	}
}

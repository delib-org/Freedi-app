import { db } from '../../db';
import { Query, CollectionReference } from 'firebase-admin/firestore';
import { Collections, StatementType, Statement } from '@freedi/shared-types';
import { shuffleArray, getRandomSample } from '../../utils/arrayUtils';

export interface GetUserOptionsParams {
	userId: string;
	parentId: string;
}

export interface GetRandomStatementsParams {
	parentId: string;
	limit?: number;
	excludeIds?: string[];
}

export interface GetTopStatementsParams {
	parentId: string;
	limit?: number;
}

export class StatementService {
	/**
	 * Get user's options for a specific parent statement
	 */
	async getUserOptions({ userId, parentId }: GetUserOptionsParams): Promise<Statement[]> {
		const userOptionsRef = db
			.collection(Collections.statements)
			.where('creatorId', '==', userId)
			.where('parentId', '==', parentId)
			.where('statementType', 'in', ['result', 'option']);

		const userOptionsDB = await userOptionsRef.get();

		return userOptionsDB.docs
			.map((doc) => doc.data() as Statement)
			.filter((statement) => !statement.hide);
	}

	/**
	 * Get random statements with optional anchored sampling
	 */

	/**
	 * StatementService - Handles statement retrieval with random and fair distribution
	 *
	 * ## Random Selection System Design
	 *
	 * This service implements a sophisticated random selection algorithm designed to work
	 * at scale with millions of concurrent users while ensuring fairness and true randomness.
	 *
	 * ### Core Principles
	 * 1. **Fairness**: Every statement gets exposure opportunity (Mean − SEM scoring ensures fair ranking)
	 * 2. **Randomness**: Unpredictable selection patterns at scale
	 * 3. **Performance**: Efficient database queries without fetching all documents
	 *
	 * ### Two-Mode Operation
	 *
	 * #### 1. Standard Random Mode
	 * Used when no anchored settings are configured. Implements tier-based random selection:
	 * - Sorts by view count (ascending) to prioritize less-viewed content
	 * - Secondary sort by random number for randomness within tiers
	 * - After each view, the random number regenerates, reshuffling position within tier
	 *
	 * #### 2. Anchored Sampling Mode
	 * Used when specific statements need guaranteed appearance:
	 * - N anchored statements are randomly selected and always included
	 * - Remaining slots filled with non-anchored statements using tier-based selection
	 * - Final shuffle ensures random presentation order
	 *
	 * ### The Tier-Based Random Algorithm
	 *
	 * Statements are implicitly grouped into "tiers" by view count:
	 * ```
	 * Tier 0: [Statements with 0 views, randomly ordered]
	 * Tier 1: [Statements with 1 view, randomly ordered]
	 * Tier 2: [Statements with 2 views, randomly ordered]
	 * ...
	 * ```
	 *
	 * **Small Scale Behavior** (few users):
	 * - Appears deterministic: same least-viewed statements keep appearing
	 * - Statements must "wait their turn" in the queue
	 * - Limited randomness
	 *
	 * **Large Scale Behavior** (millions of users):
	 * - Continuous tier progression as parallel users evaluate statements
	 * - Rapid churn between tiers creates true statistical randomness
	 * - Every statement gets sampled across the user population
	 * - No bottlenecks due to constant parallel promotions
	 *
	 * ### How Scale Creates Randomness
	 *
	 * With millions of concurrent users:
	 * 1. User A sees statements 1,2,3 (from tier 0) → promoted to tier 1
	 * 2. User B sees statements 4,5,6 (from tier 0) → promoted to tier 1
	 * 3. User C sees mix from tier 0 and tier 1 based on random numbers
	 * 4. Continuous evaluation creates dynamic tier populations
	 * 5. Random numbers within tiers + tier churn = true randomness
	 *
	 * ### View Count and Random Number Updates
	 *
	 * After each statement display:
	 * - `evaluation.viewed` increments by 1 (moves statement to next tier)
	 * - `evaluation.evaluationRandomNumber` = Math.random() (new position in tier)
	 *
	 * This ensures:
	 * - No statement dominates (moves to higher tier after viewing)
	 * - Position within new tier is random
	 * - Statistical fairness over time
	 *
	 * ### Anchored vs Non-Anchored Balance
	 *
	 * **Anchored Statements** (Admin-Prioritized Content):
	 * - Bypass view count ordering intentionally - they don't "pay the view count price"
	 * - Guaranteed inclusion in results regardless of popularity
	 * - Random selection from anchored pool for variety
	 * - Designed for important/sponsored content that must always be visible
	 * - Use cases: Admin announcements, sponsored content, curated highlights, critical options
	 * - View counts still tracked for analytics but don't affect visibility
	 *
	 * **Non-Anchored Statements** (Organic Community Content):
	 * - Follow tier-based selection for fair exposure opportunity
	 * - Subject to rotation based on view counts - ensures all content gets its turn
	 * - True randomness emerges at scale through concurrent user interactions
	 * - Represents the majority of user-generated, organic content
	 * - Use cases: Community suggestions, user proposals, organic solutions
	 *
	 * **Design Rationale**:
	 * The separation is intentional - anchored content serves administrative/business needs
	 * for guaranteed visibility, while non-anchored content provides democratic participation
	 * where all contributions get fair exposure. The two systems work in parallel without
	 * interference, each serving its distinct purpose.
	 *
	 * **Configuration Considerations**:
	 * - Balance between anchored slots and total slots is crucial
	 * - Too many anchored slots (e.g., 5 of 6) can starve organic content discovery
	 * - Too few anchored slots may not meet business/administrative needs
	 * - Recommended: Keep anchored slots to ~30-50% of total for healthy ecosystem
	 *
	 * ### Performance Considerations
	 *
	 * The system avoids fetching all documents by:
	 * - Using database-level ordering and limits
	 * - Leveraging indexes on view count and random number
	 * - Fetching only required number of documents
	 * - Batching view count updates
	 *
	 * This design scales to millions of statements and users while maintaining
	 * millisecond query response times.
	 *
	 * ### Timing Considerations & Natural Fairness
	 *
	 * **Selection Algorithm Recency Behavior**:
	 * Statements added later start at tier 0 and receive priority exposure until
	 * their view count catches up with older statements. This ensures new content
	 * gets discovered.
	 *
	 * **Why This Is Fair - Mean − SEM Scoring**:
	 * The final ranking uses Mean − SEM (Mean minus Standard Error of the Mean),
	 * which naturally compensates for any exposure imbalance:
	 *
	 * | Statement | Evaluations (n) | Mean | SEM      | Score |
	 * |-----------|-----------------|------|----------|-------|
	 * | A (early) | 200             | 0.70 | 0.021    | 0.679 |
	 * | B (late)  | 20              | 0.70 | 0.067    | 0.633 |
	 *
	 * Late additions receive a larger uncertainty penalty (higher SEM) until they
	 * accumulate sufficient evaluations. This is statistically fair - we have less
	 * confidence in their true community support.
	 *
	 * **Key Insight from Research**:
	 * "The difference in reliability between n=10 and n=100 is not linear; it is dramatic."
	 * The system self-corrects: exposure priority ≠ scoring advantage.
	 *
	 * **Real Requirement**:
	 * Ensure all proposals receive sufficient evaluations (n ≥ 100) for reliable
	 * scoring. The selection algorithm facilitates this; the scoring algorithm
	 * ensures fairness regardless of timing.
	 *
	 * @see Mean − SEM Consensus Scoring Paper:
	 * https://docs.google.com/document/d/1Ry2IwlntQY7LkPghZY9M1oR-H4Ufs8yDv_N1JgUTjKQ
	 */
	async getRandomStatements({
		parentId,
		limit = 6,
		excludeIds = [],
	}: GetRandomStatementsParams): Promise<Statement[]> {
		// Validate and cap limit
		const finalLimit = Math.min(limit, 50);

		// Get parent statement to check evaluation settings
		const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
		const parentStatement = parentDoc.data() as Statement | undefined;

		if (parentStatement?.evaluationSettings?.anchored?.anchored) {
			return this.getRandomStatementsWithAnchored(
				parentId,
				finalLimit,
				parentStatement,
				excludeIds,
			);
		}

		return this.getStandardRandomStatements(parentId, finalLimit, excludeIds);
	}

	/**
	 * Get random statements with anchored sampling
	 */
	private async getRandomStatementsWithAnchored(
		parentId: string,
		limit: number,
		parentStatement: Statement,
		excludeIds: string[] = [],
	): Promise<Statement[]> {
		const numberOfAnchoredStatements =
			parentStatement.evaluationSettings?.anchored?.numberOfAnchoredStatements || 3;
		const allSolutionStatementsRef = db.collection(Collections.statements);

		// Get anchored statements pool (excluding already viewed)
		const anchoredPool = await this.getAnchoredStatements(parentId, allSolutionStatementsRef);
		const filteredAnchoredPool = anchoredPool.filter((s) => !excludeIds.includes(s.statementId));

		// Randomly select N anchored statements
		const selectedAnchored = getRandomSample(
			filteredAnchoredPool,
			Math.min(numberOfAnchoredStatements, filteredAnchoredPool.length),
		);

		// Get non-anchored statements for remaining slots
		const remainingSlots = Math.max(0, limit - selectedAnchored.length);
		let statements: Statement[] = [];

		if (remainingSlots > 0) {
			const nonAnchoredStatements = await this.getNonAnchoredStatements(
				parentId,
				remainingSlots,
				anchoredPool.length,
				allSolutionStatementsRef,
				excludeIds,
			);
			statements = [...selectedAnchored, ...nonAnchoredStatements];
		} else {
			statements = selectedAnchored;
		}

		// Shuffle for random order
		return shuffleArray(statements);
	}

	/**
	 * Get anchored statements from the pool
	 */
	private async getAnchoredStatements(
		parentId: string,
		collectionRef: CollectionReference,
	): Promise<Statement[]> {
		const anchoredQuery = collectionRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.where('anchored', '==', true);

		const anchoredDocs = await anchoredQuery.get();

		return anchoredDocs.docs
			.map((doc) => doc.data() as Statement)
			.filter((statement) => !statement.hide);
	}

	/**
	 * Get non-anchored statements
	 */
	private async getNonAnchoredStatements(
		parentId: string,
		remainingSlots: number,
		anchoredPoolSize: number,
		collectionRef: CollectionReference,
		excludeIds: string[] = [],
	): Promise<Statement[]> {
		// First try with explicit anchored field query
		const nonAnchoredQuery: Query = collectionRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.where('anchored', 'in', [false, null])
			.orderBy('evaluation.viewed', 'asc')
			.orderBy('evaluation.evaluationRandomNumber', 'desc')
			.limit(remainingSlots);

		const nonAnchoredDocs = await nonAnchoredQuery.get();
		let randomStatements = nonAnchoredDocs.docs
			.map((doc) => doc.data() as Statement)
			.filter((s) => !s.hide && !excludeIds.includes(s.statementId));

		// Fallback if not enough statements found
		if (randomStatements.length < remainingSlots) {
			const additionalStatements = await this.getFallbackNonAnchoredStatements(
				parentId,
				remainingSlots,
				anchoredPoolSize,
				randomStatements.length,
				collectionRef,
				excludeIds,
			);
			randomStatements = [...randomStatements, ...additionalStatements];
		}

		return randomStatements;
	}

	/**
	 * Fallback method to get non-anchored statements
	 */
	private async getFallbackNonAnchoredStatements(
		parentId: string,
		remainingSlots: number,
		anchoredPoolSize: number,
		currentCount: number,
		collectionRef: CollectionReference,
		excludeIds: string[] = [],
	): Promise<Statement[]> {
		const allOptionsQuery: Query = collectionRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.orderBy('evaluation.viewed', 'asc')
			.orderBy('evaluation.evaluationRandomNumber', 'desc')
			.limit(remainingSlots + anchoredPoolSize);

		const allOptionsDocs = await allOptionsQuery.get();

		return allOptionsDocs.docs
			.map((doc) => doc.data() as Statement)
			.filter(
				(statement) =>
					!statement.hide &&
					statement.anchored !== true &&
					!excludeIds.includes(statement.statementId),
			)
			.slice(0, remainingSlots - currentCount);
	}

	/**
	 * Get standard random statements without anchored sampling
	 */
	private async getStandardRandomStatements(
		parentId: string,
		limit: number,
		excludeIds: string[] = [],
	): Promise<Statement[]> {
		const allSolutionStatementsRef = db.collection(Collections.statements);

		// Firestore 'not-in' queries are limited to 10 items
		// So we fetch more than needed and filter client-side if necessary
		const fetchLimit = excludeIds.length > 0 ? limit * 2 : limit;

		const q: Query = allSolutionStatementsRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.orderBy('evaluation.viewed', 'asc')
			.orderBy('evaluation.evaluationRandomNumber', 'desc')
			.limit(fetchLimit);

		const randomStatementsDB = await q.get();

		let statements = randomStatementsDB.docs
			.map((doc) => doc.data() as Statement)
			.filter((s) => !s.hide);

		// Filter out excluded IDs if any
		if (excludeIds.length > 0) {
			statements = statements.filter((s) => !excludeIds.includes(s.statementId));
		}

		// Return only the requested limit
		return statements.slice(0, limit);
	}

	/**
	 * Update view counts for statements
	 */
	async updateStatementViewCounts(statements: Statement[]): Promise<void> {
		const batch = db.batch();
		const allSolutionStatementsRef = db.collection(Collections.statements);

		statements.forEach((statement) => {
			const ref = allSolutionStatementsRef.doc(statement.statementId);
			batch.update(ref, {
				'evaluation.viewed': (statement.evaluation?.viewed || 0) + 1,
				'evaluation.evaluationRandomNumber': Math.random(),
			});
		});

		await batch.commit();
	}

	/**
	 * Get top statements by consensus
	 */
	async getTopStatements({ parentId, limit = 6 }: GetTopStatementsParams): Promise<Statement[]> {
		// Validate and cap limit
		const finalLimit = Math.min(limit, 50);

		const topSolutionsRef = db.collection(Collections.statements);
		const q: Query = topSolutionsRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.orderBy('evaluation.averageEvaluation', 'desc')
			.limit(finalLimit);

		const topSolutionsDB = await q.get();

		return topSolutionsDB.docs
			.map((doc) => doc.data() as Statement)
			.filter((statement) => !statement.hide);
	}
}

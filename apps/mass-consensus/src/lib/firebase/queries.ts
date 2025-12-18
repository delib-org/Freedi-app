import { Statement, StatementType, Evaluation, Collections } from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';
import { logger } from '@/lib/utils/logger';
import { ProposalSampler, BatchResult } from '@/lib/utils/proposalSampler';
import { SamplingConfig } from '@/lib/utils/sampling';

/**
 * Helper to log query errors with context
 */
function logQueryError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
  logger.error(`[${operation}] Query error:`, {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
}

/**
 * Get a question statement by ID
 * @param statementId - The statement ID
 * @returns The statement if it's a question, throws error otherwise
 */
export async function getQuestionFromFirebase(
  statementId: string
): Promise<Statement> {
  const db = getFirestoreAdmin();

  logger.info('[getQuestionFromFirebase] Fetching statement:', statementId);

  const docSnapshot = await db
    .collection(Collections.statements)
    .doc(statementId)
    .get();

  if (!docSnapshot.exists) {
    logger.error('[getQuestionFromFirebase] Document does not exist:', statementId);
    throw new Error('Question not found');
  }

  const statement = docSnapshot.data() as Statement;
  logger.info('[getQuestionFromFirebase] Found statement, type:', statement.statementType);

  if (statement.statementType !== StatementType.question) {
    logger.error('[getQuestionFromFirebase] Wrong type:', statement.statementType, 'expected: question');
    throw new Error('Statement is not a question');
  }

  logger.info('[getQuestionFromFirebase] Success:', statement.statement?.substring(0, 50));
  return statement;
}

/**
 * Get random batch of options (solutions) for a question
 * Uses randomSeed field for efficient random sampling at scale
 * REQUIRES Firestore composite index: parentId + statementType + randomSeed
 *
 * @param questionId - Parent question ID
 * @param options - Batch configuration
 * @returns Array of solution statements
 */
export async function getRandomOptions(
  questionId: string,
  options: {
    size?: number;
    userId?: string;
    excludeIds?: string[];
  } = {}
): Promise<Statement[]> {
  const { size = 6, userId, excludeIds = [] } = options;
  const db = getFirestoreAdmin();

  logger.info('[getRandomOptions] Fetching options for question:', questionId);

  // Get user's evaluation history if userId provided
  let evaluatedIds: string[] = [];
  if (userId) {
    const evaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', questionId)
      .where('evaluatorId', '==', userId)
      .get();

    evaluatedIds = evaluationsSnapshot.docs.map(
      (doc) => (doc.data() as Evaluation).statementId
    );
    logger.info('[getRandomOptions] User has evaluated:', evaluatedIds.length, 'options');
  }

  const allExcludedIds = [...excludeIds, ...evaluatedIds];
  const excludedSet = new Set(allExcludedIds);

  logger.info('[getRandomOptions] Total excluded IDs:', allExcludedIds.length);

  // Use random seed for sampling - ensures fair distribution at scale
  const randomSeed = Math.random();

  // Fetch more documents than needed to account for filtering
  // We need to over-fetch because we filter AFTER the query
  const fetchMultiplier = Math.max(3, Math.ceil(allExcludedIds.length / size) + 1);
  const fetchSize = size * fetchMultiplier;

  // Query 1: Get options with randomSeed >= random value
  const query = db
    .collection(Collections.statements)
    .where('parentId', '==', questionId)
    .where('statementType', '==', StatementType.option)
    .where('randomSeed', '>=', randomSeed)
    .limit(fetchSize);

  const snapshot = await query.get();
  logger.info('[getRandomOptions] First query (randomSeed >=', randomSeed.toFixed(3), ') fetched:', snapshot.size, 'docs (requested', fetchSize, ')');

  let options_results = snapshot.docs
    .map((doc) => doc.data() as Statement)
    .filter((opt) => !opt.hide && !excludedSet.has(opt.statementId));

  logger.info('[getRandomOptions] After filtering (hide/excluded):', options_results.length, 'options');

  // If not enough, fetch from other side
  if (options_results.length < size) {
    const remainingNeeded = size - options_results.length;
    const moreFetchSize = remainingNeeded * fetchMultiplier;

    const moreQuery = db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .where('randomSeed', '<', randomSeed)
      .limit(moreFetchSize);

    const moreSnapshot = await moreQuery.get();
    logger.info('[getRandomOptions] Second query (randomSeed <', randomSeed.toFixed(3), ') fetched:', moreSnapshot.size, 'docs (requested', moreFetchSize, ')');

    const moreOptions = moreSnapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((opt) => !opt.hide && !excludedSet.has(opt.statementId));

    logger.info('[getRandomOptions] Additional options after filtering:', moreOptions.length);

    options_results = [...options_results, ...moreOptions];
  }

  logger.info('[getRandomOptions] Final result:', options_results.length, 'options (requested', size, ')');

  return options_results.slice(0, size);
}

/**
 * Get adaptive batch of options using Thompson Sampling
 *
 * This function implements priority-based sampling that:
 * - Prioritizes under-evaluated proposals
 * - Boosts recent submissions (counteracts temporal bias)
 * - Graduates stable proposals (early stopping)
 * - Uses Thompson sampling for exploration/exploitation balance
 *
 * @param questionId - Parent question ID
 * @param userId - User ID for evaluation history lookup
 * @param options - Batch configuration
 * @returns Batch result with solutions, hasMore flag, and statistics
 */
export async function getAdaptiveBatch(
  questionId: string,
  userId?: string,
  options: {
    size?: number;
    config?: Partial<SamplingConfig>;
  } = {}
): Promise<BatchResult> {
  const { size = 6, config } = options;
  const db = getFirestoreAdmin();
  const sampler = new ProposalSampler(config);

  logger.info('[getAdaptiveBatch] Starting Thompson Sampling batch fetch:', {
    questionId,
    userId: userId || '(anonymous/SSR)',
    requestedSize: size,
  });

  try {
    // 1. Fetch all options for this question (no random seed needed)
    const allOptionsSnapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .get();

    const proposals = allOptionsSnapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((p) => !p.hide);

    logger.info('[getAdaptiveBatch] Fetched proposals:', {
      total: allOptionsSnapshot.size,
      afterHideFilter: proposals.length,
    });

    if (proposals.length === 0) {
      logger.info('[getAdaptiveBatch] No proposals found');
      return {
        solutions: [],
        hasMore: false,
        stats: {
          totalCount: 0,
          evaluatedCount: 0,
          stableCount: 0,
          remainingCount: 0,
        },
      };
    }

    // 2. Get user's already-evaluated IDs (skip if no userId - SSR case)
    let evaluatedIds = new Set<string>();
    if (userId) {
      const evaluatedSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .where('evaluatorId', '==', userId)
        .get();

      evaluatedIds = new Set(
        evaluatedSnapshot.docs.map((doc) => (doc.data() as Evaluation).statementId)
      );

      logger.info('[getAdaptiveBatch] User evaluation history:', {
        userId,
        evaluatedCount: evaluatedIds.size,
      });
    } else {
      logger.info('[getAdaptiveBatch] No userId provided (SSR) - using Thompson Sampling without user history');
    }

    // 3. Select batch using adaptive priority sampling (Thompson Sampling)
    const selected = sampler.selectForUser(proposals, evaluatedIds, size);

    // 4. Calculate statistics
    const stats = sampler.calculateStats(proposals, evaluatedIds, selected.length);

    logger.info('[getAdaptiveBatch] Thompson Sampling batch selected:', {
      selectedCount: selected.length,
      hasMore: stats.remainingCount > 0,
      stats,
    });

    return {
      solutions: selected,
      hasMore: stats.remainingCount > 0,
      stats,
    };
  } catch (error) {
    logQueryError('getAdaptiveBatch', error, { questionId, userId, size });
    throw error;
  }
}

/**
 * Get all solutions sorted by consensus
 * REQUIRES Firestore composite index: parentId + statementType + consensus
 * @param questionId - Parent question ID
 * @param limit - Maximum number of results
 * @returns Sorted array of statements
 */
export async function getAllSolutionsSorted(
  questionId: string,
  limit = 100
): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .orderBy('consensus', 'desc')
      .limit(limit)
      .get();

    logger.info('[getAllSolutionsSorted] Found', snapshot.size, 'solutions for question:', questionId);

    return snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((statement) => !statement.hide);
  } catch (error) {
    logQueryError('getAllSolutionsSorted', error, { questionId, limit });
    throw error;
  }
}

/**
 * Get user's solutions for a question
 * REQUIRES Firestore composite index: parentId + statementType + creatorId + consensus
 * @param questionId - Parent question ID
 * @param userId - User ID
 * @returns Array of user's statements
 */
export async function getUserSolutions(
  questionId: string,
  userId: string
): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .where('creatorId', '==', userId)
      .orderBy('consensus', 'desc')
      .get();

    logger.info('[getUserSolutions] Found', snapshot.size, 'solutions for user:', userId);

    return snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((statement) => !statement.hide);
  } catch (error) {
    logQueryError('getUserSolutions', error, { questionId, userId });
    throw error;
  }
}

/**
 * Get evaluation for a specific user and statement
 * @param userId - User ID
 * @param statementId - Statement ID
 * @returns Evaluation if exists, null otherwise
 */
export async function getUserEvaluation(
  userId: string,
  statementId: string
): Promise<Evaluation | null> {
  const db = getFirestoreAdmin();
  const evaluationId = `${userId}--${statementId}`;

  const docSnapshot = await db
    .collection(Collections.evaluations)
    .doc(evaluationId)
    .get();

  if (!docSnapshot.exists) {
    return null;
  }

  return docSnapshot.data() as Evaluation;
}

/**
 * Update statement consensus based on all evaluations
 * @param statementId - Statement to update
 */
export async function updateStatementConsensus(
  statementId: string
): Promise<void> {
  const db = getFirestoreAdmin();

  // Get all evaluations for this statement
  const evaluationsSnapshot = await db
    .collection(Collections.evaluations)
    .where('statementId', '==', statementId)
    .get();

  if (evaluationsSnapshot.empty) {
    return;
  }

  const evaluations = evaluationsSnapshot.docs.map(
    (doc) => (doc.data() as Evaluation).evaluation
  );

  // Calculate average consensus
  const consensus =
    evaluations.reduce((sum, val) => sum + val, 0) / evaluations.length;

  // Update statement
  await db
    .collection(Collections.statements)
    .doc(statementId)
    .update({
      consensus,
      lastUpdate: Date.now(),
    });
}

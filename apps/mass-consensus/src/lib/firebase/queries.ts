import { Statement, StatementType, Evaluation, Collections, statementToParagraph } from '@freedi/shared-types';
import type { Paragraph } from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';
import { logger } from '@/lib/utils/logger';
import { ProposalSampler, BatchResult } from '@/lib/utils/proposalSampler';
import { SamplingConfig } from '@/lib/utils/sampling';
import { isServableOriginal } from '@/lib/utils/derivedStatements';
import {
  buildClusterMembershipMap,
  getClusterKey,
  deriveSeenClusters,
  selectDiverseBatch,
} from '@/lib/utils/diverseBatch';
import { CommentData } from '@/types/api';

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
 * Sanitize statement for client components
 * Removes non-serializable fields like VectorValue (embedding)
 */
function sanitizeStatement(statement: Statement): Statement {
  // Create a shallow copy and remove embedding field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, ...rest } = statement as Statement & { embedding?: unknown };
  return rest as Statement;
}

/**
 * Fisher-Yates shuffle (returns a new array). The randomSeed-range queries
 * return docs ordered by seed ascending, which is not uniformly random —
 * shuffling removes that ordering bias before diverse selection.
 */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Fetch the live cluster docs of a question and build a memberId -> clusterId
 * map. Cluster docs are written with `statementType: option` + `isCluster:
 * true`, so the randomSeed-range queries never return them — this dedicated
 * equality query fills the gap for the random serving path.
 */
async function getClusterMembership(questionId: string): Promise<Map<string, string>> {
  try {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('isCluster', '==', true)
      .get();

    return buildClusterMembershipMap(snapshot.docs.map((doc) => doc.data() as Statement));
  } catch (error) {
    // Diversity is best-effort — serving must not fail because of it.
    logQueryError('getClusterMembership', error, { questionId });
    return new Map();
  }
}

/**
 * Resolve the rich-body paragraphs of a statement, preferring the canonical
 * model (child Statements with `statementType === paragraph`) and falling back
 * to the deprecated embedded `statement.paragraphs[]` for un-migrated docs.
 *
 * @param statement - The host statement (question/solution)
 * @returns Ordered `Paragraph[]` (empty if the statement has no body)
 */
export async function getParagraphsForStatement(
  statement: Statement
): Promise<Paragraph[]> {
  try {
    const db = getFirestoreAdmin();
    const snap = await db
      .collection(Collections.statements)
      .where('parentId', '==', statement.statementId)
      .where('statementType', '==', StatementType.paragraph)
      .get();

    const children = snap.docs
      .map((d) => d.data() as Statement)
      .filter((p) => p.hide !== true);

    if (children.length > 0) {
      return children
        .map(statementToParagraph)
        .sort((a, b) => a.order - b.order);
    }
  } catch (error) {
    logQueryError('getParagraphsForStatement', error, { statementId: statement.statementId });
  }

  // Legacy fallback: deprecated embedded array.
  return statement.paragraphs ?? [];
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

  // Hydrate the canonical rich body (paragraph child statements) onto the
  // returned object so downstream readers — which consume `question.paragraphs`
  // — work whether the body is stored as children (new) or embedded (legacy).
  const paragraphs = await getParagraphsForStatement(statement);

  logger.info('[getQuestionFromFirebase] Success:', statement.statement?.substring(0, 50));
  return sanitizeStatement({ ...statement, paragraphs });
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
    stratified?: boolean;
  } = {}
): Promise<Statement[]> {
  const { size = 6, userId, excludeIds = [] } = options;
  const db = getFirestoreAdmin();

  logger.info('[getRandomOptions] Fetching options for question:', questionId);

  // Cluster membership (for diverse selection) and the user's evaluation
  // history are independent — fetch them in parallel.
  const [membership, evaluatedIds] = await Promise.all([
    getClusterMembership(questionId),
    (async (): Promise<string[]> => {
      if (!userId) return [];
      const evaluationsSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .where('evaluatorId', '==', userId)
        .get();

      return evaluationsSnapshot.docs.map(
        (doc) => (doc.data() as Evaluation).statementId
      );
    })(),
  ]);

  if (userId) {
    logger.info('[getRandomOptions] User has evaluated:', evaluatedIds.length, 'options');
  }

  const allExcludedIds = [...excludeIds, ...evaluatedIds];
  const excludedSet = new Set(allExcludedIds);

  logger.info('[getRandomOptions] Total excluded IDs:', allExcludedIds.length);

  // Use random seed for sampling - ensures fair distribution at scale
  const randomSeed = Math.random();

  // Fetch more documents than needed: we filter AFTER the query, and diverse
  // selection needs a pool spanning several clusters, not just `size` docs.
  const poolTarget = size * 3;
  const fetchMultiplier = Math.max(4, Math.ceil(allExcludedIds.length / size) + 1);
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
    .map((doc) => sanitizeStatement(doc.data() as Statement))
    .filter((opt) => isServableOriginal(opt) && !excludedSet.has(opt.statementId));

  logger.info('[getRandomOptions] After filtering (derived/hide/excluded):', options_results.length, 'options');

  // If the pool is too thin for cluster variety, fetch from the other side
  if (options_results.length < poolTarget) {
    const remainingNeeded = poolTarget - options_results.length;
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
      .map((doc) => sanitizeStatement(doc.data() as Statement))
      .filter((opt) => isServableOriginal(opt) && !excludedSet.has(opt.statementId));

    logger.info('[getRandomOptions] Additional options after filtering:', moreOptions.length);

    options_results = [...options_results, ...moreOptions];
  }

  // Shuffle the pool (caller owns randomness; selection is deterministic),
  // then spread the batch across clusters — unseen clusters first so
  // consecutive batches rotate through the question's topics.
  const seenClusters = deriveSeenClusters(excludedSet, membership);
  const selected = selectDiverseBatch(
    shuffle(options_results),
    size,
    (s) => getClusterKey(s, membership),
    seenClusters
  );

  logger.info('[getRandomOptions] Final result:', selected.length, 'options (requested', size, '), clusters:', selected.map((s) => getClusterKey(s, membership)));

  return selected;
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

    const allStatements = allOptionsSnapshot.docs.map((doc) =>
      sanitizeStatement(doc.data() as Statement)
    );
    const proposals = allStatements.filter(isServableOriginal);

    // Cluster docs share statementType: option, so they are already in this
    // snapshot — membership for diverse selection costs zero extra reads.
    const membership = buildClusterMembershipMap(allStatements);

    logger.info('[getAdaptiveBatch] Fetched proposals:', {
      total: allOptionsSnapshot.size,
      afterServableFilter: proposals.length,
      clusteredMembers: membership.size,
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

    // 3. Thompson Sampling selection, spread across clusters (round-robin,
    //    rotating to clusters the user hasn't evaluated yet).
    const selected = sampler.selectForUser(proposals, evaluatedIds, size, {
      clusterKeyOf: (s) => getClusterKey(s, membership),
      seenClusters: deriveSeenClusters(evaluatedIds, membership),
    });

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

    // Fetch all options (can't orderBy nested field evaluation.agreement in Firestore)
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .get();

    logger.info('[getAllSolutionsSorted] Found', snapshot.size, 'solutions for question:', questionId);

    // Sort by evaluation.agreement (fallback to consensus for legacy data) and apply limit
    return snapshot.docs
      .map((doc) => sanitizeStatement(doc.data() as Statement))
      .filter((statement) => !statement.hide)
      .sort((a, b) => (b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0))
      .slice(0, limit);
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

    // Fetch user's options (can't orderBy nested field evaluation.agreement in Firestore)
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .where('creatorId', '==', userId)
      .get();

    logger.info('[getUserSolutions] Found', snapshot.size, 'solutions for user:', userId);

    // Sort by evaluation.agreement (fallback to consensus for legacy data)
    return snapshot.docs
      .map((doc) => sanitizeStatement(doc.data() as Statement))
      .filter((statement) => !statement.hide)
      .sort((a, b) => (b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0));
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
 * Get user's suggestions across multiple questions (for survey mode)
 * @param questionIds - Array of question IDs to query
 * @param userId - User ID
 * @returns Map of questionId -> user's suggestions
 */
export async function getUserSuggestionsForSurvey(
  questionIds: string[],
  userId: string
): Promise<Map<string, Statement[]>> {
  try {
    const results = await Promise.all(
      questionIds.map(async (questionId) => {
        const solutions = await getUserSolutions(questionId, userId);

        return { questionId, solutions };
      })
    );

    const map = new Map<string, Statement[]>();
    for (const { questionId, solutions } of results) {
      if (solutions.length > 0) {
        map.set(questionId, solutions);
      }
    }

    logger.info('[getUserSuggestionsForSurvey] Found suggestions for', map.size, 'questions, user:', userId);

    return map;
  } catch (error) {
    logQueryError('getUserSuggestionsForSurvey', error, { questionIds, userId });
    throw error;
  }
}

/**
 * Get comments for multiple statements (batch query)
 * Pre-fetches first N comments per statement for SSR
 * @param statementIds - Array of statement IDs to fetch comments for
 * @param limitPerStatement - Max comments per statement (default 2 for SSR)
 * @returns Map of statementId -> comments
 */
export async function getCommentsForStatements(
  statementIds: string[],
  limitPerStatement = 2
): Promise<Map<string, { comments: CommentData[]; total: number }>> {
  try {
    const db = getFirestoreAdmin();
    const result = new Map<string, { comments: CommentData[]; total: number }>();

    if (statementIds.length === 0) return result;

    // Query in batches of 30 (Firestore 'in' limit)
    const batchSize = 30;
    for (let i = 0; i < statementIds.length; i += batchSize) {
      const batch = statementIds.slice(i, i + batchSize);

      const snapshot = await db
        .collection(Collections.statements)
        .where('parentId', 'in', batch)
        .where('statementType', '==', StatementType.comment)
        .orderBy('createdAt', 'desc')
        .get();

      // Group by parentId
      const grouped = new Map<string, CommentData[]>();
      for (const doc of snapshot.docs) {
        const data = doc.data() as Statement;
        const parentId = data.parentId;
        if (!parentId) continue;

        const comment: CommentData = {
          statementId: data.statementId,
          statement: data.statement,
          reasoning: data.reasoning,
          createdAt: data.createdAt,
          creator: data.creator,
          creatorId: data.creatorId,
        };

        const existing = grouped.get(parentId) || [];
        existing.push(comment);
        grouped.set(parentId, existing);
      }

      // Apply limit per statement
      for (const [parentId, comments] of grouped) {
        result.set(parentId, {
          comments: comments.slice(0, limitPerStatement),
          total: comments.length,
        });
      }
    }

    // Ensure all requested statement IDs have entries
    for (const id of statementIds) {
      if (!result.has(id)) {
        result.set(id, { comments: [], total: 0 });
      }
    }

    logger.info(
      '[getCommentsForStatements] Fetched comments for',
      result.size,
      'statements'
    );

    return result;
  } catch (error) {
    logQueryError('getCommentsForStatements', error, { statementIds: statementIds.length });
    throw error;
  }
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

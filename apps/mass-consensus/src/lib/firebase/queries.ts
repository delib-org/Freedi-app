import { Statement, StatementType, Evaluation, Collections } from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';

/**
 * Helper to log query errors with context
 */
function logQueryError(operation: string, error: unknown, context: Record<string, unknown> = {}): void {
  console.error(`[${operation}] Query error:`, {
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

  console.info('[getQuestionFromFirebase] Fetching statement:', statementId);

  const docSnapshot = await db
    .collection(Collections.statements)
    .doc(statementId)
    .get();

  if (!docSnapshot.exists) {
    console.error('[getQuestionFromFirebase] Document does not exist:', statementId);
    throw new Error('Question not found');
  }

  const statement = docSnapshot.data() as Statement;
  console.info('[getQuestionFromFirebase] Found statement, type:', statement.statementType);

  if (statement.statementType !== StatementType.question) {
    console.error('[getQuestionFromFirebase] Wrong type:', statement.statementType, 'expected: question');
    throw new Error('Statement is not a question');
  }

  console.info('[getQuestionFromFirebase] Success:', statement.statement?.substring(0, 50));
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

  console.info('[getRandomOptions] Fetching options for question:', questionId);

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
    console.info('[getRandomOptions] User has evaluated:', evaluatedIds.length, 'options');
  }

  const allExcludedIds = [...excludeIds, ...evaluatedIds];

  // Use random seed for sampling - ensures fair distribution at scale
  const randomSeed = Math.random();

  // Query 1: Get options with randomSeed >= random value
  const query = db
    .collection(Collections.statements)
    .where('parentId', '==', questionId)
    .where('statementType', '==', StatementType.option)
    .where('randomSeed', '>=', randomSeed)
    .limit(size);

  const snapshot = await query.get();
  console.info('[getRandomOptions] First query (randomSeed >=', randomSeed.toFixed(3), ') returned:', snapshot.size, 'docs');

  let options_results = snapshot.docs
    .map((doc) => doc.data() as Statement)
    .filter((opt) => !opt.hide && !allExcludedIds.includes(opt.statementId));

  console.info('[getRandomOptions] After filtering (hide/excluded):', options_results.length, 'options');

  // If not enough, fetch from other side
  if (options_results.length < size) {
    const moreQuery = db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .where('randomSeed', '<', randomSeed)
      .limit(size - options_results.length);

    const moreSnapshot = await moreQuery.get();
    console.info('[getRandomOptions] Second query (randomSeed <', randomSeed.toFixed(3), ') returned:', moreSnapshot.size, 'docs');

    const moreOptions = moreSnapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((opt) => !opt.hide && !allExcludedIds.includes(opt.statementId));

    options_results = [...options_results, ...moreOptions];
  }

  console.info('[getRandomOptions] Final result:', options_results.length, 'options');

  return options_results.slice(0, size);
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

    console.info('[getAllSolutionsSorted] Found', snapshot.size, 'solutions for question:', questionId);

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

    console.info('[getUserSolutions] Found', snapshot.size, 'solutions for user:', userId);

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

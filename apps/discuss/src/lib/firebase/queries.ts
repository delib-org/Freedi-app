import { Statement, StatementType, Evaluation, Collections } from 'delib-npm';
import { getFirestoreAdmin } from './admin';

/**
 * Get a question statement by ID
 * @param statementId - The statement ID
 * @returns The statement if it's a question, throws error otherwise
 */
export async function getQuestionFromFirebase(
  statementId: string
): Promise<Statement> {
  const db = getFirestoreAdmin();

  const docSnapshot = await db
    .collection(Collections.statements)
    .doc(statementId)
    .get();

  if (!docSnapshot.exists) {
    throw new Error('Question not found');
  }

  const statement = docSnapshot.data() as Statement;

  if (statement.statementType !== StatementType.question) {
    throw new Error('Statement is not a question');
  }

  return statement;
}

/**
 * Get random batch of options (solutions) for a question
 * Uses randomSeed field for efficient random sampling
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
  const { size = 10, userId, excludeIds = [] } = options;
  const db = getFirestoreAdmin();

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
  }

  const allExcludedIds = [...excludeIds, ...evaluatedIds];

  // Use random seed for sampling
  const randomSeed = Math.random();

  // Query 1: Get options with randomSeed >= random value
  let query = db
    .collection(Collections.statements)
    .where('parentId', '==', questionId)
    .where('statementType', '==', StatementType.option)
    .where('hide', '!=', true)
    .where('randomSeed', '>=', randomSeed)
    .limit(size);

  let snapshot = await query.get();
  let options_results = snapshot.docs
    .map((doc) => doc.data() as Statement)
    .filter((opt) => !allExcludedIds.includes(opt.statementId));

  // If not enough, fetch from other side
  if (options_results.length < size) {
    const moreQuery = db
      .collection(Collections.statements)
      .where('parentId', '==', questionId)
      .where('statementType', '==', StatementType.option)
      .where('hide', '!=', true)
      .where('randomSeed', '<', randomSeed)
      .limit(size - options_results.length);

    const moreSnapshot = await moreQuery.get();
    const moreOptions = moreSnapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((opt) => !allExcludedIds.includes(opt.statementId));

    options_results = [...options_results, ...moreOptions];
  }

  return options_results.slice(0, size);
}

/**
 * Get all solutions sorted by consensus
 * @param questionId - Parent question ID
 * @param limit - Maximum number of results
 * @returns Sorted array of statements
 */
export async function getAllSolutionsSorted(
  questionId: string,
  limit = 100
): Promise<Statement[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(Collections.statements)
    .where('parentId', '==', questionId)
    .where('statementType', '==', StatementType.option)
    .where('hide', '!=', true)
    .orderBy('consensus', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Statement);
}

/**
 * Get user's solutions for a question
 * @param questionId - Parent question ID
 * @param userId - User ID
 * @returns Array of user's statements
 */
export async function getUserSolutions(
  questionId: string,
  userId: string
): Promise<Statement[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(Collections.statements)
    .where('parentId', '==', questionId)
    .where('statementType', '==', StatementType.option)
    .where('creatorId', '==', userId)
    .orderBy('consensus', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as Statement);
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

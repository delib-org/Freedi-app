import { Collections, type Evaluation } from '@freedi/shared-types';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  SetOptions,
  Transaction,
} from 'firebase-admin/firestore';

/**
 * The one place MC writes a participant's evaluation of an option.
 *
 * Every evaluation doc uses the deterministic id `${userId}--${statementId}`
 * and is mirrored into `userEvaluations/${userId}--${parentId}` so the swipe
 * deck can skip cards the participant has already rated. Both the swipe
 * evaluations API and the submit route ("I created this" / "I picked this
 * existing one") go through here, so a participant can never end up with two
 * evaluation docs for the same option.
 *
 * Aggregates (consensus, numberOfEvaluators, …) are deliberately NOT written
 * here; the onCreateEvaluation / onUpdateEvaluation triggers own them.
 */

export interface EvaluationWriteInput {
  statementId: string;
  parentId: string;
  userId: string;
  displayName: string;
  /** -1..1 (agree-disagree) or 0..1 (reactions) */
  evaluation: number;
  /** Survey demographic anchor, when the evaluation happened inside a survey session */
  demographicAnchorId?: string;
}

/**
 * The one method these writes need. Both WriteBatch and Transaction satisfy
 * it, but their overload sets differ, so a union of the two is not callable.
 */
export interface EvaluationWriter {
  set(ref: DocumentReference<DocumentData>, data: DocumentData, options?: SetOptions): unknown;
}

export interface UpsertEvaluationResult {
  evaluationId: string;
  /** true when no evaluation existed for this user + option before */
  created: boolean;
}

export const evaluationDocId = (userId: string, statementId: string): string =>
  `${userId}--${statementId}`;

export const userEvaluationDocId = (userId: string, parentId: string): string =>
  `${userId}--${parentId}`;

/** The evaluation document, minus any anchor preserved from a previous write. */
export function buildEvaluationDoc(input: EvaluationWriteInput, now: number): Partial<Evaluation> {
  const { statementId, parentId, userId, displayName, evaluation, demographicAnchorId } = input;

  return {
    evaluationId: evaluationDocId(userId, statementId),
    parentId,
    statementId,
    evaluatorId: userId,
    evaluator: {
      uid: userId,
      displayName,
      email: '',
      photoURL: '',
      isAnonymous: true,
    },
    evaluation,
    updatedAt: now,
    ...(demographicAnchorId ? { demographicAnchorId } : {}),
  };
}

/** The userEvaluations mirror, written with merge so `evaluatedOptionsIds` accumulates. */
export function buildUserEvaluationDoc(
  input: Pick<EvaluationWriteInput, 'userId' | 'parentId' | 'statementId'>,
  now: number,
  alreadyExists: boolean,
): Record<string, unknown> {
  const { userId, parentId, statementId } = input;

  return {
    userEvaluationId: userEvaluationDocId(userId, parentId),
    userId,
    parentStatementId: parentId,
    evaluatedOptionsIds: FieldValue.arrayUnion(statementId),
    lastUpdated: now,
    // Only stamp createdAt the first time the doc is written
    ...(alreadyExists ? {} : { createdAt: now }),
  };
}

/**
 * Queue the evaluation doc + userEvaluations mirror on a batch or transaction.
 * Use this when the caller already knows the option is new to this user
 * (e.g. the option itself was just created in the same batch).
 */
export function applyEvaluationWrites(
  writer: EvaluationWriter,
  db: Firestore,
  input: EvaluationWriteInput,
  options: { userEvaluationExists: boolean; now?: number },
): string {
  const now = options.now ?? Date.now();
  const evaluationId = evaluationDocId(input.userId, input.statementId);
  const evaluationRef = db.collection(Collections.evaluations).doc(evaluationId);
  const userEvaluationRef = db
    .collection(Collections.userEvaluations)
    .doc(userEvaluationDocId(input.userId, input.parentId));

  writer.set(evaluationRef, buildEvaluationDoc(input, now));
  writer.set(userEvaluationRef, buildUserEvaluationDoc(input, now, options.userEvaluationExists), {
    merge: true,
  });

  return evaluationId;
}

/**
 * Create or update the participant's evaluation of an option in one
 * transaction. A demographic anchor already stored on the evaluation is kept
 * when the caller does not send one (a participant re-rating later, outside
 * the survey session).
 *
 * `whenCreated` lets the caller add writes that must happen only the first
 * time this user rates this option (e.g. a legacy counter), inside the same
 * transaction.
 */
export async function upsertEvaluation(
  db: Firestore,
  input: EvaluationWriteInput,
  whenCreated?: (transaction: Transaction) => void,
): Promise<UpsertEvaluationResult> {
  const evaluationId = evaluationDocId(input.userId, input.statementId);
  const evaluationRef = db.collection(Collections.evaluations).doc(evaluationId);
  const userEvaluationRef = db
    .collection(Collections.userEvaluations)
    .doc(userEvaluationDocId(input.userId, input.parentId));

  return db.runTransaction(async (transaction) => {
    const [userEvalDoc, existingEvalDoc] = await Promise.all([
      transaction.get(userEvaluationRef),
      transaction.get(evaluationRef),
    ]);

    const resolvedInput: EvaluationWriteInput = { ...input };
    if (!resolvedInput.demographicAnchorId && existingEvalDoc.exists) {
      const existingAnchor = existingEvalDoc.data()?.demographicAnchorId;
      if (typeof existingAnchor === 'string' && existingAnchor) {
        resolvedInput.demographicAnchorId = existingAnchor;
      }
    }

    applyEvaluationWrites(transaction, db, resolvedInput, {
      userEvaluationExists: userEvalDoc.exists,
    });

    const created = !existingEvalDoc.exists;
    if (created && whenCreated) {
      whenCreated(transaction);
    }

    return { evaluationId, created };
  });
}

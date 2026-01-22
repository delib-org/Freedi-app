/**
 * Server-side Firestore queries for demographics in Sign app
 */

import { getFirestoreAdmin } from './admin';
import { Collections, UserDemographicQuestion, UserDemographicQuestionType } from '@freedi/shared-types';
import {
  DemographicMode,
  SignDemographicQuestion,
  SurveyCompletionStatus,
  DemographicAnswer,
  QuestionWithAnswer,
} from '@/types/demographics';
import { logError } from '@/lib/utils/errorHandling';

const SIGN_SCOPE = 'sign';

/**
 * Get demographic questions for a Sign document
 * Based on mode: inherit (from main app) or custom (sign-specific)
 */
export async function getDemographicQuestions(
  documentId: string,
  mode: DemographicMode,
  topParentId: string
): Promise<SignDemographicQuestion[]> {
  if (mode === 'disabled') {
    return [];
  }

  const db = getFirestoreAdmin();

  try {
    if (mode === 'inherit') {
      // Get questions from main app (group-level and statement-level)
      const questionsRef = db.collection(Collections.userDemographicQuestions);

      // Query group-level questions
      const groupSnapshot = await questionsRef
        .where('topParentId', '==', topParentId)
        .where('scope', '==', 'group')
        .get();

      // Query statement-level questions
      const statementSnapshot = await questionsRef
        .where('statementId', '==', documentId)
        .where('scope', '==', 'statement')
        .get();

      const groupQuestions = groupSnapshot.docs.map((doc) => ({
        ...doc.data() as UserDemographicQuestion,
        isInherited: true,
      }));

      const statementQuestions = statementSnapshot.docs.map((doc) => ({
        ...doc.data() as UserDemographicQuestion,
        isInherited: true,
      }));

      // Merge and sort by order
      const allQuestions = [...groupQuestions, ...statementQuestions];
      allQuestions.sort((a, b) => (a.order || 0) - (b.order || 0));

      console.info(`[Demographics] Found ${allQuestions.length} inherited questions for document: ${documentId}`);

      return allQuestions;
    }

    if (mode === 'custom') {
      // Get sign-specific questions
      const snapshot = await db
        .collection(Collections.userDemographicQuestions)
        .where('statementId', '==', documentId)
        .where('scope', '==', SIGN_SCOPE)
        .orderBy('order', 'asc')
        .get();

      const questions = snapshot.docs.map((doc) => ({
        ...doc.data() as UserDemographicQuestion,
        documentId,
        isInherited: false,
      }));

      console.info(`[Demographics] Found ${questions.length} custom questions for document: ${documentId}`);

      return questions;
    }

    return [];
  } catch (error) {
    logError(error, { operation: 'demographics.getDemographicQuestions', documentId });
    throw error;
  }
}

/**
 * Get user's demographic answers for a document
 */
export async function getUserDemographicAnswers(
  documentId: string,
  userId: string,
  topParentId: string,
  mode: DemographicMode
): Promise<QuestionWithAnswer[]> {
  if (mode === 'disabled') {
    return [];
  }

  const db = getFirestoreAdmin();

  try {
    // Get the questions first
    const questions = await getDemographicQuestions(documentId, mode, topParentId);

    if (questions.length === 0) {
      return [];
    }

    // Get user's answers from usersData collection
    const answersRef = db.collection(Collections.usersData);

    // Query answers for this user
    const answeredQuestions: QuestionWithAnswer[] = [];

    for (const question of questions) {
      if (!question.userQuestionId) continue;

      const answerId = `${question.userQuestionId}--${userId}`;
      const answerDoc = await answersRef.doc(answerId).get();

      if (answerDoc.exists) {
        const answerData = answerDoc.data() as UserDemographicQuestion;
        answeredQuestions.push({
          ...question,
          userAnswer: answerData.answer,
          userAnswerOptions: answerData.answerOptions,
        });
      } else {
        answeredQuestions.push({
          ...question,
          userAnswer: undefined,
          userAnswerOptions: undefined,
        });
      }
    }

    console.info(`[Demographics] Found ${answeredQuestions.filter((q) => q.userAnswer || q.userAnswerOptions).length} answers for user: ${userId}`);

    return answeredQuestions;
  } catch (error) {
    logError(error, { operation: 'demographics.getUserDemographicAnswers', documentId, userId });
    throw error;
  }
}

/**
 * Check if user has completed the required survey
 * Only REQUIRED questions are considered for blocking - optional questions don't block interactions
 *
 * Logic:
 * - If mode is 'disabled': No survey needed
 * - If there are no questions: No survey needed
 * - If there are required questions: Must answer all of them
 * - If there are only optional questions: Must acknowledge the survey (submit at least once)
 */
export async function checkSurveyCompletion(
  documentId: string,
  userId: string,
  mode: DemographicMode,
  topParentId: string,
  isRequired: boolean
): Promise<SurveyCompletionStatus> {
  if (mode === 'disabled') {
    return {
      isComplete: true,
      totalQuestions: 0,
      answeredQuestions: 0,
      isRequired: false,
      missingQuestionIds: [],
    };
  }

  try {
    const questionsWithAnswers = await getUserDemographicAnswers(documentId, userId, topParentId, mode);
    const totalQuestions = questionsWithAnswers.length;

    // If there are no questions, survey is complete
    if (totalQuestions === 0) {
      return {
        isComplete: true,
        totalQuestions: 0,
        answeredQuestions: 0,
        isRequired: false,
        missingQuestionIds: [],
      };
    }

    // Count required and answered questions
    const requiredQuestions = questionsWithAnswers.filter((q) => q.required === true);
    const totalRequiredQuestions = requiredQuestions.length;

    const answeredRequiredQuestions = requiredQuestions.filter(
      (q) => q.userAnswer !== undefined || (q.userAnswerOptions && q.userAnswerOptions.length > 0)
    ).length;

    const answeredQuestions = questionsWithAnswers.filter(
      (q) => q.userAnswer !== undefined || (q.userAnswerOptions && q.userAnswerOptions.length > 0)
    ).length;

    // Get IDs of unanswered REQUIRED questions only
    const missingQuestionIds = requiredQuestions
      .filter((q) => q.userAnswer === undefined && (!q.userAnswerOptions || q.userAnswerOptions.length === 0))
      .map((q) => q.userQuestionId)
      .filter(Boolean) as string[];

    // Check if user has acknowledged the survey (has any answer record or acknowledgement)
    const hasAcknowledged = await checkSurveyAcknowledgement(documentId, userId);

    // Determine completion:
    // - If there are required questions: all must be answered
    // - If no required questions: user must have acknowledged (submitted) the survey
    let isComplete: boolean;
    if (totalRequiredQuestions > 0) {
      isComplete = answeredRequiredQuestions === totalRequiredQuestions;
    } else {
      // No required questions - just need acknowledgement
      isComplete = hasAcknowledged;
    }

    return {
      isComplete,
      totalQuestions,
      answeredQuestions,
      isRequired,
      missingQuestionIds,
    };
  } catch (error) {
    logError(error, { operation: 'demographics.checkSurveyCompletion', documentId, userId });
    return {
      isComplete: false,
      totalQuestions: 0,
      answeredQuestions: 0,
      isRequired,
      missingQuestionIds: [],
    };
  }
}

/**
 * Check if user has acknowledged the survey for a document
 */
async function checkSurveyAcknowledgement(
  documentId: string,
  userId: string
): Promise<boolean> {
  const db = getFirestoreAdmin();

  try {
    // Check for acknowledgement record
    const ackId = `survey-ack--${documentId}--${userId}`;
    const ackDoc = await db.collection(Collections.usersData).doc(ackId).get();

    return ackDoc.exists;
  } catch (error) {
    logError(error, { operation: 'demographics.checkSurveyAcknowledgement', documentId, userId });
    return false;
  }
}

/**
 * Save survey acknowledgement (called when user submits/dismisses the survey)
 */
export async function saveSurveyAcknowledgement(
  documentId: string,
  userId: string,
  topParentId: string
): Promise<void> {
  const db = getFirestoreAdmin();

  try {
    const ackId = `survey-ack--${documentId}--${userId}`;
    await db.collection(Collections.usersData).doc(ackId).set({
      documentId,
      topParentId,
      odlUserId: userId,
      acknowledgedAt: Date.now(),
      type: 'survey-acknowledgement',
    });

    console.info(`[Demographics] Survey acknowledged for user ${userId} on document ${documentId}`);
  } catch (error) {
    logError(error, { operation: 'demographics.saveSurveyAcknowledgement', documentId, userId });
    throw error;
  }
}

/**
 * Save a demographic question (admin only, for custom mode)
 */
export async function saveDemographicQuestion(
  documentId: string,
  topParentId: string,
  question: Partial<SignDemographicQuestion>
): Promise<SignDemographicQuestion> {
  const db = getFirestoreAdmin();

  try {
    const userQuestionId = question.userQuestionId || `sign-${documentId}-${Date.now()}`;

    // Cast the scope as the delib-npm type only accepts 'group' | 'statement' but we use 'sign'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questionData: SignDemographicQuestion = {
      question: question.question || '',
      type: question.type || UserDemographicQuestionType.text,
      options: question.options || [],
      statementId: documentId,
      topParentId,
      userQuestionId,
      scope: SIGN_SCOPE as 'group' | 'statement',
      order: question.order || 0,
      required: question.required || false,
      displayType: question.displayType, // For radio questions: 'radio' or 'dropdown'
    } as SignDemographicQuestion;

    await db
      .collection(Collections.userDemographicQuestions)
      .doc(userQuestionId)
      .set(questionData, { merge: true });

    console.info(`[Demographics] Saved question: ${userQuestionId} for document: ${documentId}`);

    return {
      ...questionData,
      documentId,
      isInherited: false,
    };
  } catch (error) {
    logError(error, { operation: 'demographics.saveDemographicQuestion', documentId });
    throw error;
  }
}

/**
 * Delete a demographic question (admin only)
 */
export async function deleteDemographicQuestion(questionId: string): Promise<void> {
  const db = getFirestoreAdmin();

  try {
    await db.collection(Collections.userDemographicQuestions).doc(questionId).delete();
    console.info(`[Demographics] Deleted question: ${questionId}`);
  } catch (error) {
    logError(error, { operation: 'demographics.deleteDemographicQuestion', metadata: { questionId } });
    throw error;
  }
}

/**
 * Save user's demographic answers
 */
export async function saveUserDemographicAnswers(
  documentId: string,
  userId: string,
  topParentId: string,
  answers: DemographicAnswer[]
): Promise<void> {
  const db = getFirestoreAdmin();
  const batch = db.batch();

  try {
    for (const answer of answers) {
      const answerId = `${answer.userQuestionId}--${userId}`;
      const answerRef = db.collection(Collections.usersData).doc(answerId);

      // Build answer data without undefined values (Firestore doesn't accept undefined)
      const answerData: Record<string, unknown> = {
        userQuestionId: answer.userQuestionId,
        odlUserId: userId,
        statementId: documentId,
        topParentId,
      };

      // Only add answer fields if they are defined
      if (answer.answer !== undefined) {
        answerData.answer = answer.answer;
      }
      if (answer.answerOptions !== undefined && answer.answerOptions.length > 0) {
        answerData.answerOptions = answer.answerOptions;
      }

      batch.set(answerRef, answerData, { merge: true });
    }

    await batch.commit();
    console.info(`[Demographics] Saved ${answers.length} answers for user: ${userId}`);
  } catch (error) {
    logError(error, { operation: 'demographics.saveUserDemographicAnswers', documentId, userId });
    throw error;
  }
}

/**
 * Get all questions for a document (for admin viewing)
 */
export async function getAllQuestionsForDocument(
  documentId: string,
  topParentId: string
): Promise<SignDemographicQuestion[]> {
  const db = getFirestoreAdmin();

  try {
    // Get both inherited and custom questions
    const questionsRef = db.collection(Collections.userDemographicQuestions);

    // Query all relevant questions
    const [groupSnapshot, statementSnapshot, signSnapshot] = await Promise.all([
      questionsRef
        .where('topParentId', '==', topParentId)
        .where('scope', '==', 'group')
        .get(),
      questionsRef
        .where('statementId', '==', documentId)
        .where('scope', '==', 'statement')
        .get(),
      questionsRef
        .where('statementId', '==', documentId)
        .where('scope', '==', SIGN_SCOPE)
        .get(),
    ]);

    const groupQuestions = groupSnapshot.docs.map((doc) => ({
      ...doc.data() as UserDemographicQuestion,
      isInherited: true,
    }));

    const statementQuestions = statementSnapshot.docs.map((doc) => ({
      ...doc.data() as UserDemographicQuestion,
      isInherited: true,
    }));

    const signQuestions = signSnapshot.docs.map((doc) => ({
      ...doc.data() as UserDemographicQuestion,
      documentId,
      isInherited: false,
    }));

    const allQuestions = [...groupQuestions, ...statementQuestions, ...signQuestions];
    allQuestions.sort((a, b) => (a.order || 0) - (b.order || 0));

    return allQuestions;
  } catch (error) {
    logError(error, { operation: 'demographics.getAllQuestionsForDocument', documentId });
    throw error;
  }
}

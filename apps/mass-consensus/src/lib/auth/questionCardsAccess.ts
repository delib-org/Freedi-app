import { Statement } from '@freedi/shared-types';
import { getSurveyById } from '../firebase/surveys';
import { logError } from '../utils/errorHandling';
import { isAdminOfStatement } from './verifyAdmin';
import { resolveSurveyAccess } from './surveyAccess';

/**
 * May `userId` manage the cards of this question (list them, change their
 * pictures)?
 *
 * Yes for an admin of the question, and — when it is reached through a
 * survey — for that survey's owner and editors, who run the question from MC
 * admin without ever holding a subscription on it. The survey only counts
 * when the question really is one of its questions; otherwise a survey
 * editor could reach any question by naming their own survey.
 */
export async function canEditQuestionCards(
  userId: string,
  questionId: string,
  surveyId?: string | null
): Promise<boolean> {
  if (await isAdminOfStatement(userId, questionId)) return true;
  if (!surveyId) return false;

  try {
    const survey = await getSurveyById(surveyId);
    if (!survey || !survey.questionIds?.includes(questionId)) return false;

    const access = await resolveSurveyAccess(survey, userId);

    return access?.canEdit === true;
  } catch (error) {
    logError(error, {
      operation: 'questionCardsAccess.canEditQuestionCards',
      userId,
      questionId,
      metadata: { surveyId },
    });

    return false;
  }
}

/** May `userId` change the picture on this option's card? Same rule, via its question. */
export function canEditCardImage(
  userId: string,
  option: Statement,
  surveyId?: string | null
): Promise<boolean> {
  return canEditQuestionCards(userId, option.parentId, surveyId);
}

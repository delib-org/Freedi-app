import { Statement } from '@freedi/shared-types';
import { getSurveyById } from '../firebase/surveys';
import { logError } from '../utils/errorHandling';
import { isAdminOfStatement } from './verifyAdmin';
import { resolveSurveyAccess } from './surveyAccess';

/**
 * May `userId` put a picture on this option's card?
 *
 * Yes for an admin of the question it answers, and — when the card is shown
 * inside a survey — for that survey's owner and editors, who run the question
 * from MC admin without ever holding a subscription on it. The survey only
 * counts when the question really is one of its questions; otherwise a
 * survey editor could reach any option by naming their own survey.
 */
export async function canEditCardImage(
  userId: string,
  option: Statement,
  surveyId?: string | null
): Promise<boolean> {
  if (await isAdminOfStatement(userId, option.parentId)) return true;
  if (!surveyId) return false;

  try {
    const survey = await getSurveyById(surveyId);
    if (!survey || !survey.questionIds?.includes(option.parentId)) return false;

    const access = await resolveSurveyAccess(survey, userId);

    return access?.canEdit === true;
  } catch (error) {
    logError(error, {
      operation: 'cardImageAccess.canEditCardImage',
      userId,
      statementId: option.statementId,
      metadata: { surveyId },
    });

    return false;
  }
}

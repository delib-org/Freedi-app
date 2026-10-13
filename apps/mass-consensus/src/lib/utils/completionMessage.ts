/**
 * The admin's own message on a survey's completion screen. It is stored as an
 * explanation page (`Survey.completionMessage`) so the explanation editor and
 * renderer serve it unchanged; only its id and position are fixed here.
 */
import type { Survey, SurveyExplanationPage } from '@freedi/shared-types';

export const COMPLETION_MESSAGE_ID = 'completion-message';

/** A fresh, empty completion message. Position -1 = after everything. */
export function createCompletionMessage(title: string): SurveyExplanationPage {
  return {
    explanationPageId: COMPLETION_MESSAGE_ID,
    title,
    content: '',
    position: -1,
  };
}

/**
 * The completion message participants should see, or undefined when there is
 * nothing to show (none set, or one added but left without text or picture).
 */
export function getVisibleCompletionMessage(
  survey: Pick<Survey, 'completionMessage'>
): SurveyExplanationPage | undefined {
  const message = survey.completionMessage;
  if (!message) return undefined;

  const hasText = typeof message.content === 'string' && message.content.trim().length > 0;
  const hasPicture = typeof message.heroImageUrl === 'string' && message.heroImageUrl.trim().length > 0;

  return hasText || hasPicture ? message : undefined;
}

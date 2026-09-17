/**
 * Question Cards Controller
 * The option cards of an existing question, for the admin's Cards panel.
 */

import { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { httpErrorFromResponse } from '@/lib/utils/errorHandling';

export async function fetchQuestionCards(questionId: string, surveyId?: string): Promise<Statement[]> {
  const query = surveyId ? `?surveyId=${encodeURIComponent(surveyId)}` : '';
  const response = await authedFetch(`/api/questions/${encodeURIComponent(questionId)}/cards${query}`);
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to load cards');
  }

  const body = (await response.json()) as { cards?: Statement[] };

  return body.cards ?? [];
}

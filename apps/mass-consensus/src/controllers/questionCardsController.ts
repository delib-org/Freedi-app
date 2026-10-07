/**
 * Question Cards Controller
 * The option cards of an existing question, for the admin's options editor:
 * list them, add new ones, change a card's text, take a card out.
 */

import { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { httpErrorFromResponse } from '@/lib/utils/errorHandling';

const surveyQuery = (surveyId?: string) => (surveyId ? `?surveyId=${encodeURIComponent(surveyId)}` : '');

export async function fetchQuestionCards(questionId: string, surveyId?: string): Promise<Statement[]> {
  const response = await authedFetch(`/api/questions/${encodeURIComponent(questionId)}/cards${surveyQuery(surveyId)}`);
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to load cards');
  }

  const body = (await response.json()) as { cards?: Statement[] };

  return body.cards ?? [];
}

/** Add text-only cards to the question, in the order given. Returns the created cards. */
export async function createQuestionCards(
  questionId: string,
  texts: string[],
  surveyId?: string
): Promise<Statement[]> {
  const response = await authedFetch(`/api/questions/${encodeURIComponent(questionId)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, surveyId }),
  });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to add cards');
  }

  const body = (await response.json()) as { cards?: Statement[] };

  return body.cards ?? [];
}

export async function updateCardText(statementId: string, text: string, surveyId?: string): Promise<void> {
  const response = await authedFetch(`/api/statements/${encodeURIComponent(statementId)}${surveyQuery(surveyId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statement: text }),
  });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to save the card');
  }
}

/** Take the card out of its question. The statement is hidden, not deleted. */
export async function hideCard(statementId: string, surveyId?: string): Promise<void> {
  const response = await authedFetch(`/api/statements/${encodeURIComponent(statementId)}${surveyQuery(surveyId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hide: true }),
  });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to delete the card');
  }
}

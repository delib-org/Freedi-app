/**
 * Card Image Controller
 * The picture an admin puts on an option's swipe card, via the image API route.
 */

import { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { httpErrorFromResponse } from '@/lib/utils/errorHandling';

export type ImagesURL = Statement['imagesURL'];

function imageEndpoint(statementId: string, surveyId?: string): string {
  const base = `/api/statements/${encodeURIComponent(statementId)}/image`;

  return surveyId ? `${base}?surveyId=${encodeURIComponent(surveyId)}` : base;
}

/** Whether the signed-in user may change this option's picture. */
export async function fetchCanEditCardImage(statementId: string, surveyId?: string): Promise<boolean> {
  const response = await authedFetch(imageEndpoint(statementId, surveyId));
  if (!response.ok) return false;

  const body = (await response.json()) as { canEdit?: boolean };

  return body.canEdit === true;
}

export async function uploadCardImage(params: {
  statementId: string;
  /** Omit to change only the description of the current picture. */
  file?: File | null;
  alt: string;
  surveyId?: string;
}): Promise<ImagesURL> {
  const form = new FormData();
  if (params.file) form.append('file', params.file);
  form.append('alt', params.alt);
  if (params.surveyId) form.append('surveyId', params.surveyId);

  const response = await authedFetch(imageEndpoint(params.statementId), {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to upload image');
  }

  const body = (await response.json()) as { imagesURL: ImagesURL };

  return body.imagesURL;
}

export async function deleteCardImage(statementId: string, surveyId?: string): Promise<ImagesURL> {
  const response = await authedFetch(imageEndpoint(statementId, surveyId), { method: 'DELETE' });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to remove image');
  }

  const body = (await response.json()) as { imagesURL: ImagesURL };

  return body.imagesURL;
}

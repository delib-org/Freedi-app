/**
 * Survey Image Controller
 * A picture an admin drops into one of a survey's own pages, via the images API route.
 */

import { authedFetch } from '@/lib/api/authedFetch';
import { httpErrorFromResponse } from '@/lib/utils/errorHandling';

/** Uploads the file and returns the public URL to put in the page. */
export async function uploadSurveyImage(surveyId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  const response = await authedFetch(`/api/surveys/${encodeURIComponent(surveyId)}/images`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    throw await httpErrorFromResponse(response, 'Failed to upload image');
  }

  const body = (await response.json()) as { url: string };

  return body.url;
}

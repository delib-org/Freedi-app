'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { uploadSurveyImage } from '@/controllers/surveyImageController';
import { checkCardImageFile } from '@/lib/utils/cardImage';
import { pictureProblemKey } from '@/lib/utils/cardDrafts';
import { HttpError, logError } from '@/lib/utils/errorHandling';
import type { ImageDropZoneState } from '@/components/admin/ImageDropZone';

const HTTP_BAD_REQUEST = 400;

export interface SurveyImageUpload {
  /** Resolves to the public URL, or null when the file was refused (the error is set). */
  upload: (file: File) => Promise<string | null>;
  state: ImageDropZoneState;
  errorMessage: string | undefined;
  reset: () => void;
}

/**
 * One picture at a time into a survey's images folder: checks the file
 * first, then uploads, and keeps the state a drop zone needs to show.
 */
export function useSurveyImageUpload(surveyId: string | undefined): SurveyImageUpload {
  const { t } = useTranslation();
  const [state, setState] = useState<ImageDropZoneState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const fail = useCallback(
    (message: string): null => {
      setState('error');
      setErrorMessage(message);

      return null;
    },
    []
  );

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!surveyId) return fail(t('Save the survey first, then add pictures'));

      const problem = checkCardImageFile(file);
      if (problem) return fail(t(pictureProblemKey(problem)));

      setState('uploading');
      setErrorMessage(undefined);
      try {
        const url = await uploadSurveyImage(surveyId, file);
        setState('idle');

        return url;
      } catch (error) {
        logError(error, {
          operation: 'useSurveyImageUpload.upload',
          metadata: { surveyId, fileType: file.type, fileSize: file.size },
        });
        const refused = error instanceof HttpError && error.status === HTTP_BAD_REQUEST;

        return fail(t(pictureProblemKey(refused ? 'content' : 'network')));
      }
    },
    [surveyId, fail, t]
  );

  const reset = useCallback(() => {
    setState('idle');
    setErrorMessage(undefined);
  }, []);

  return { upload, state, errorMessage, reset };
}

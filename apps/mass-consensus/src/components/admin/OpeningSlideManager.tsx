'use client';

import React, { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { Survey, SurveyLogo } from '@freedi/shared-types';
import { OpeningSlideEditor } from './OpeningSlideEditor';

interface OpeningSlideManagerProps {
  survey: Survey;
  onUpdate: (survey: Survey) => void;
}

/**
 * Container component that handles API calls for OpeningSlideEditor
 */
export default function OpeningSlideManager({ survey, onUpdate }: OpeningSlideManagerProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async (data: {
    show: boolean;
    content: string;
    logos: SurveyLogo[];
  }): Promise<void> => {
    try {
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/surveys/${survey.surveyId}/opening-slide`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          show: data.show,
          content: data.content,
        }),
      });

      if (!response.ok) {
        throw new Error(t('failedToUpdateOpeningSlide'));
      }

      const result = await response.json();

      // Update survey state
      onUpdate({
        ...survey,
        showOpeningSlide: result.showOpeningSlide,
        openingSlideContent: result.openingSlideContent,
        logos: data.logos,
      });

      setSuccess(t('openingSlideUpdated'));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    }
  };

  const handleLogoUpload = async (file: File, altText: string): Promise<SurveyLogo> => {
    try {
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('altText', altText);
      formData.append('order', String(survey.logos?.length || 0));

      const response = await fetch(`/api/surveys/${survey.surveyId}/logos`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('logoUploadError'));
      }

      const result = await response.json();

      // Update survey state
      const updatedLogos = [...(survey.logos || []), result.logo];
      onUpdate({
        ...survey,
        logos: updatedLogos,
      });

      setSuccess(t('logoUploadSuccess'));
      setTimeout(() => setSuccess(null), 3000);

      return result.logo;
    } catch (err) {
      throw err; // Re-throw so FileUpload can display the error
    }
  };

  const handleLogoDelete = async (logoId: string): Promise<void> => {
    try {
      setError(null);

      const response = await fetch(`/api/surveys/${survey.surveyId}/logos/${logoId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(t('failedToDeleteLogo'));
      }

      // Update survey state
      const updatedLogos = (survey.logos || []).filter((logo) => logo.logoId !== logoId);
      onUpdate({
        ...survey,
        logos: updatedLogos,
      });

      setSuccess(t('logoDeleted'));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    }
  };

  const handleLogoUpdate = async (logoId: string, altText: string): Promise<void> => {
    try {
      const response = await fetch(`/api/surveys/${survey.surveyId}/logos/${logoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ altText }),
      });

      if (!response.ok) {
        throw new Error(t('failedToUpdateLogo'));
      }

      const result = await response.json();

      // Update survey state
      const updatedLogos = (survey.logos || []).map((logo) =>
        logo.logoId === logoId ? result.logo : logo
      );
      onUpdate({
        ...survey,
        logos: updatedLogos,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    }
  };

  const handleLogosReorder = async (logoIds: string[]): Promise<void> => {
    try {
      const response = await fetch(`/api/surveys/${survey.surveyId}/logos/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logoIds }),
      });

      if (!response.ok) {
        throw new Error(t('failedToReorderLogos'));
      }

      const result = await response.json();

      // Update survey state
      onUpdate({
        ...survey,
        logos: result.logos,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    }
  };

  return (
    <div>
      {error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: 'rgba(var(--disagree-rgb), 0.1)',
            color: 'var(--disagree)',
            borderRadius: '8px',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: 'rgba(var(--agree-rgb), 0.1)',
            color: 'var(--agree)',
            borderRadius: '8px',
          }}
        >
          {success}
        </div>
      )}

      <OpeningSlideEditor
        survey={survey}
        onSave={handleSave}
        onLogoUpload={handleLogoUpload}
        onLogoDelete={handleLogoDelete}
        onLogoUpdate={handleLogoUpdate}
        onLogosReorder={handleLogosReorder}
      />
    </div>
  );
}

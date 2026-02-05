'use client';

import React, { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import ReactMarkdown from 'react-markdown';
import type { Survey, SurveyLogo } from '@freedi/shared-types';
import { FileUpload } from './FileUpload';
import { LogoManager } from './LogoManager';
import clsx from 'clsx';

export interface OpeningSlideEditorProps {
  /** Survey to edit */
  survey: Survey;
  /** Callback when opening slide settings are saved */
  onSave: (data: {
    show: boolean;
    content: string;
    logos: SurveyLogo[];
  }) => Promise<void>;
  /** Callback when logo is uploaded */
  onLogoUpload: (file: File, altText: string) => Promise<SurveyLogo>;
  /** Callback when logo is deleted */
  onLogoDelete: (logoId: string) => Promise<void>;
  /** Callback when logo alt text is updated */
  onLogoUpdate: (logoId: string, altText: string) => Promise<void>;
  /** Callback when logos are reordered */
  onLogosReorder: (logoIds: string[]) => Promise<void>;
  /** Class name for custom styling */
  className?: string;
}

export const OpeningSlideEditor: React.FC<OpeningSlideEditorProps> = ({
  survey,
  onSave,
  onLogoUpload,
  onLogoDelete,
  onLogoUpdate,
  onLogosReorder,
  className,
}) => {
  const { t } = useTranslation();

  // Local state
  const [showOpeningSlide, setShowOpeningSlide] = useState(survey.showOpeningSlide || false);
  const [content, setContent] = useState(survey.openingSlideContent || '');
  const [logos, setLogos] = useState<SurveyLogo[]>(survey.logos || []);
  const [isEditing, setIsEditing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFileSelect = async (file: File): Promise<void> => {
    setUploading(true);
    setUploadError(null);

    try {
      const newLogo = await onLogoUpload(file, '');
      setLogos([...logos, newLogo]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('logoUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAltText = async (logoId: string, altText: string): Promise<void> => {
    // Update local state immediately
    setLogos(logos.map((logo) =>
      logo.logoId === logoId ? { ...logo, altText } : logo
    ));

    // Update on server
    await onLogoUpdate(logoId, altText);
  };

  const handleDeleteLogo = async (logoId: string): Promise<void> => {
    await onLogoDelete(logoId);
    setLogos(logos.filter((logo) => logo.logoId !== logoId));
  };

  const handleReorderLogos = async (logoIds: string[]): Promise<void> => {
    // Reorder local state
    const reordered = logoIds.map((id) => logos.find((logo) => logo.logoId === id)!).filter(Boolean);
    setLogos(reordered);

    // Update on server
    await onLogosReorder(logoIds);
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);

    try {
      await onSave({
        show: showOpeningSlide,
        content,
        logos,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={clsx('opening-slide-editor', className)}>
      {/* Enable/Disable Toggle */}
      <div className="opening-slide-editor__toggle">
        <label>
          <input
            type="checkbox"
            checked={showOpeningSlide}
            onChange={(e): void => setShowOpeningSlide(e.target.checked)}
          />
          <span>{t('showOpeningSlide')}</span>
        </label>
        <p className="opening-slide-editor__toggle-hint">
          {showOpeningSlide
            ? t('openingSlideEnabledHint')
            : t('openingSlideDisabledHint')}
        </p>
      </div>

      {/* Content Editor (only show if enabled) */}
      {showOpeningSlide && (
        <>
          {/* Logo Upload Section */}
          <div className="opening-slide-editor__section">
            <h3>{t('logos')}</h3>
            <FileUpload
              onFileSelect={handleFileSelect}
              uploading={uploading}
              error={uploadError || undefined}
            />
            <LogoManager
              logos={logos}
              onUpdateAltText={handleUpdateAltText}
              onDeleteLogo={handleDeleteLogo}
              onReorder={handleReorderLogos}
            />
          </div>

          {/* Markdown Content Editor */}
          <div className="opening-slide-editor__section">
            <div className="opening-slide-editor__content-header">
              <h3>{t('openingSlideContent')}</h3>
              <div className="opening-slide-editor__tabs">
                <button
                  type="button"
                  onClick={(): void => setIsEditing(true)}
                  className={clsx(
                    'opening-slide-editor__tab',
                    isEditing && 'opening-slide-editor__tab--active'
                  )}
                >
                  {t('edit')}
                </button>
                <button
                  type="button"
                  onClick={(): void => setIsEditing(false)}
                  className={clsx(
                    'opening-slide-editor__tab',
                    !isEditing && 'opening-slide-editor__tab--active'
                  )}
                >
                  {t('preview')}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={content}
                onChange={(e): void => setContent(e.target.value)}
                placeholder={t('openingSlideContentPlaceholder')}
                className="opening-slide-editor__textarea"
                rows={15}
              />
            ) : (
              <div className="opening-slide-editor__preview">
                {content.trim().length > 0 ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <p className="opening-slide-editor__preview-empty">
                    {t('noContentToPreview')}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="opening-slide-editor__actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="opening-slide-editor__save-btn"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
};

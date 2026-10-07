'use client';

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyExplanationPage } from '@freedi/shared-types';
import { useSurveyImageUpload } from '@/hooks/useSurveyImageUpload';
import { imageFilesFrom } from '@/lib/utils/cardDrafts';
import { altFromFileName, insertMarkdownImage } from '@/lib/utils/surveyImage';
import MarkdownRenderer from '../shared/MarkdownRenderer';
import ImageDropZone from './ImageDropZone';
import styles from './Admin.module.scss';

interface ExplanationEditorProps {
  page: SurveyExplanationPage;
  /** Pictures upload into this survey's folder; without one (a survey not yet created) they wait. */
  surveyId?: string;
  onUpdate: (updates: Partial<SurveyExplanationPage>) => void;
  onRemove: () => void;
}

/**
 * Inline editor for explanation pages with edit/preview toggle.
 * Pictures arrive by drag-and-drop: onto the hero well, or onto the text
 * itself, where they become a markdown image at the caret.
 */
export default function ExplanationEditor({
  page,
  surveyId,
  onUpdate,
  onRemove,
}: ExplanationEditorProps) {
  const { t } = useTranslation();
  const [isPreview, setIsPreview] = useState(false);
  const [isTextDragOver, setIsTextDragOver] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const hero = useSurveyImageUpload(surveyId);
  const inline = useSurveyImageUpload(surveyId);

  const handleHeroFile = async (file: File) => {
    const url = await hero.upload(file);
    if (url) onUpdate({ heroImageUrl: url });
  };

  const handleHeroUrl = (url: string) => {
    hero.reset();
    onUpdate({ heroImageUrl: url || undefined });
  };

  /** A picture dropped or pasted on the text lands as a markdown image at the caret. */
  const insertPicture = async (file: File) => {
    const url = await inline.upload(file);
    if (!url) return;

    const textArea = textAreaRef.current;
    const content = page.content || '';
    const caret = textArea?.selectionStart ?? content.length;
    const next = insertMarkdownImage(content, caret, url, altFromFileName(file.name));
    onUpdate({ content: next.content });
    // Put the caret after the image once React has rendered the new text
    requestAnimationFrame(() => {
      textArea?.focus();
      textArea?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleTextDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    setIsTextDragOver(false);
    const files = imageFilesFrom(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    void insertPicture(files[0]);
  };

  const handleTextPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFrom(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    void insertPicture(files[0]);
  };

  const saveFirstHint = t('Save the survey first, then add pictures');

  return (
    <div className={styles.explanationEditor}>
      {/* Title */}
      <div className={styles.formGroup}>
        <label>{t('explanationPageTitle') || 'Page Title'}</label>
        <input
          type="text"
          className={styles.textInput}
          value={page.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={t('explanationTitlePlaceholder') || 'e.g., Before You Begin'}
        />
      </div>

      {/* Hero picture */}
      <div className={styles.formGroup}>
        <label>{t('heroImage')}</label>
        <ImageDropZone
          imageUrl={page.heroImageUrl}
          ariaLabel={t('Hero picture for this page')}
          state={hero.state}
          errorMessage={hero.errorMessage}
          onFile={handleHeroFile}
          onRemove={() => handleHeroUrl('')}
          onUrlChange={handleHeroUrl}
          disabled={!surveyId}
          disabledHint={saveFirstHint}
        />
      </div>

      {/* Content (Markdown) */}
      <div className={styles.formGroup}>
        <div className={styles.contentHeader}>
          <label>{t('explanationContent') || 'Content (Markdown)'}</label>
          <div className={styles.previewToggle}>
            <button
              type="button"
              className={`${styles.toggleButton} ${!isPreview ? styles.active : ''}`}
              onClick={() => setIsPreview(false)}
            >
              {t('editContent') || 'Edit'}
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${isPreview ? styles.active : ''}`}
              onClick={() => setIsPreview(true)}
            >
              {t('previewContent') || 'Preview'}
            </button>
          </div>
        </div>

        {isPreview ? (
          <div className={styles.markdownPreview}>
            <MarkdownRenderer content={page.content || ''} />
          </div>
        ) : (
          <>
            <textarea
              ref={textAreaRef}
              className={clsx(
                styles.textArea,
                isTextDragOver && styles.textAreaDragOver,
                inline.state === 'uploading' && styles.textAreaUploading
              )}
              value={page.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              onDragOver={(e) => {
                if (!surveyId) return;
                e.preventDefault();
                setIsTextDragOver(true);
              }}
              onDragLeave={() => setIsTextDragOver(false)}
              onDrop={handleTextDrop}
              onPaste={handleTextPaste}
              placeholder={t('explanationContentPlaceholder') || 'Write your explanation here using Markdown...'}
              rows={8}
              aria-busy={inline.state === 'uploading'}
            />
            {inline.state === 'error' && inline.errorMessage ? (
              <p className={styles.hint} role="alert">
                {inline.errorMessage}
              </p>
            ) : (
              <p className={styles.hint}>
                {surveyId
                  ? t('Supports headings, bold, lists and links. Drop a picture onto the text to add it.')
                  : saveFirstHint}
                {surveyId && ` ${t('Colour: (blue)text(/blue) — blue, green, red, orange, purple, gray.')}`}
              </p>
            )}
          </>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        className={styles.removeExplanationButton}
        onClick={onRemove}
      >
        {t('removeExplanationPage') || 'Remove Explanation Page'}
      </button>
    </div>
  );
}

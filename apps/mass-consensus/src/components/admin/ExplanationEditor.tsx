'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyExplanationPage } from '@freedi/shared-types';
import MarkdownRenderer from '../shared/MarkdownRenderer';
import styles from './Admin.module.scss';

interface ExplanationEditorProps {
  page: SurveyExplanationPage;
  onUpdate: (updates: Partial<SurveyExplanationPage>) => void;
  onRemove: () => void;
}

/**
 * Inline editor for explanation pages with edit/preview toggle
 */
export default function ExplanationEditor({
  page,
  onUpdate,
  onRemove,
}: ExplanationEditorProps) {
  const { t } = useTranslation();
  const [isPreview, setIsPreview] = useState(false);

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

      {/* Hero Image URL */}
      <div className={styles.formGroup}>
        <label>{t('heroImageUrl') || 'Hero Image URL (optional)'}</label>
        <input
          type="text"
          className={styles.textInput}
          value={page.heroImageUrl || ''}
          onChange={(e) => onUpdate({ heroImageUrl: e.target.value || undefined })}
          placeholder={t('heroImageUrlPlaceholder') || 'https://example.com/image.jpg'}
        />
        {page.heroImageUrl && (
          <div className={styles.imagePreview}>
            <img
              src={page.heroImageUrl}
              alt="Hero preview"
              style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px', marginTop: '0.5rem' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
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
              className={styles.textArea}
              value={page.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder={t('explanationContentPlaceholder') || 'Write your explanation here using Markdown...'}
              rows={8}
            />
            <p className={styles.hint}>
              {t('markdownSupported') || 'Supports headings, bold, lists, links, and images'}
            </p>
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

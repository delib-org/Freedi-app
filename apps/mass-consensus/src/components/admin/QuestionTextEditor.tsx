'use client';

import { useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Admin.module.scss';

interface QuestionTextEditorProps {
  questionText: string;
  onChange: (text: string) => void;
}

/**
 * Inline editor for question text with live markdown preview.
 * Supports **bold** and *italic* formatting only (simple markdown).
 */
export default function QuestionTextEditor({
  questionText,
  onChange,
}: QuestionTextEditorProps) {
  const { t } = useTranslation();

  // Simple markdown parser for bold and italic only
  const formattedPreview = useMemo(() => {
    if (!questionText.trim()) {
      return null;
    }

    // Parse **bold** and *italic* patterns
    const html = questionText
      // Escape HTML entities first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_ (but not inside words)
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

    return html;
  }, [questionText]);

  const hasFormatting = questionText.includes('*') || questionText.includes('_');

  return (
    <div className={styles.questionTextEditor}>
      <div className={styles.formGroup}>
        <label>{t('questionText') || 'Question Text'}</label>
        <textarea
          className={styles.questionTextArea}
          value={questionText}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('questionTextPlaceholder') || 'Enter the question text...'}
          rows={3}
        />
        <span className={styles.markdownHintInline}>
          {t('markdownHintSimple') || 'Supports **bold** and *italic* formatting'}
        </span>
      </div>

      {hasFormatting && formattedPreview && (
        <div className={styles.questionPreviewBox}>
          <span className={styles.previewLabelSmall}>
            {t('preview') || 'Preview'}:
          </span>
          <span
            className={styles.questionPreviewText}
            dangerouslySetInnerHTML={{ __html: formattedPreview }}
          />
        </div>
      )}
    </div>
  );
}

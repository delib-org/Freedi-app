'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { updateDocumentTitleToDB } from '@/controllers/db/paragraphs/setParagraphStatement';
import { logError } from '@/lib/utils/errorHandling';
import styles from './EditableTitle.module.scss';

interface EditableTitleProps {
  documentId: string;
  initialTitle: string;
  onTitleChange?: (newTitle: string) => void;
}

/**
 * Inline editable document title component
 * Follows Notion/Google Docs pattern for intuitive editing
 */
export default function EditableTitle({
  documentId,
  initialTitle,
  onTitleChange,
}: EditableTitleProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update local state if initialTitle changes
  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setTitle(initialTitle);
      setIsEditing(false);
      return;
    }

    if (trimmedTitle === initialTitle) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateDocumentTitleToDB({
        documentId,
        title: trimmedTitle,
      });
      setIsEditing(false);
      onTitleChange?.(trimmedTitle);
    } catch (error) {
      logError(error, {
        operation: 'EditableTitle.handleSave',
        documentId,
      });
      setTitle(initialTitle);
    } finally {
      setIsSaving(false);
    }
  }, [title, initialTitle, documentId, onTitleChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setTitle(initialTitle);
      setIsEditing(false);
    }
  }, [handleSave, initialTitle]);

  const handleClick = useCallback(() => {
    if (!isEditing && !isSaving) {
      setIsEditing(true);
    }
  }, [isEditing, isSaving]);

  if (isEditing) {
    return (
      <div className={styles.editContainer}>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className={styles.titleInput}
          disabled={isSaving}
          placeholder={t('Enter document title...')}
          aria-label={t('Document title')}
        />
        {isSaving && (
          <span className={styles.savingIndicator}>{t('Saving...')}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.titleContainer}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={t('Click to edit document title')}
    >
      <h1 className={styles.title}>{title || t('Untitled Document')}</h1>
      <svg
        className={styles.editIcon}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

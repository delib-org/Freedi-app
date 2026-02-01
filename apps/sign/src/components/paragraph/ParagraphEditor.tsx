'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Statement } from '@freedi/shared-types';
import { createLiveEditingManager, LiveEditingSession, ActiveEditor } from '@/lib/realtime/liveEditingSession';
import { logError } from '@/lib/utils/errorHandling';
import styles from './ParagraphEditor.module.scss';

interface ParagraphEditorProps {
  /** The official paragraph statement to edit */
  paragraph: Statement;
  /** The document ID */
  documentId: string;
  /** Current user info */
  userId: string;
  displayName: string;
  /** Whether the user can edit (admin only) */
  canEdit: boolean;
  /** Callback when save is clicked */
  onSave: (newText: string) => Promise<void>;
  /** Callback when cancel is clicked */
  onCancel: () => void;
}

/**
 * ParagraphEditor - Real-time collaborative text editor
 *
 * Features:
 * - Live draft sync via Firebase RTDB (300ms debounce)
 * - Multi-user cursor tracking with colored indicators
 * - Auto-save drafts (no data loss)
 * - Explicit save button to persist to Firestore
 */
export default function ParagraphEditor({
  paragraph,
  documentId,
  userId,
  displayName,
  canEdit,
  onSave,
  onCancel,
}: ParagraphEditorProps) {
  const { t } = useTranslation();
  const [draftText, setDraftText] = useState(paragraph.statement);
  const [isSaving, setIsSaving] = useState(false);
  const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorManagerRef = useRef(createLiveEditingManager());

  // Join live editing session on mount
  useEffect(() => {
    if (!canEdit) return;

    const manager = editorManagerRef.current;

    // Join session
    manager
      .joinSession(
        documentId,
        paragraph.statementId,
        userId,
        displayName,
        paragraph.statement
      )
      .catch((error) => {
        logError(error, {
          operation: 'paragraphEditor.joinSession',
          documentId,
          paragraphId: paragraph.statementId,
          userId,
        });
      });

    // Subscribe to real-time updates
    const unsubscribe = manager.subscribeToSession((session: LiveEditingSession | null) => {
      if (!session) return;

      // Update draft if changed by another user
      // Only update if we're not currently focused (avoid interrupting typing)
      if (document.activeElement !== textareaRef.current) {
        setDraftText(session.draftContent);
      }

      // Update active editors list
      const editors = manager.getActiveEditors(session);
      setActiveEditors(editors);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe?.();
      manager.cleanup().catch((error) => {
        logError(error, {
          operation: 'paragraphEditor.cleanup',
          paragraphId: paragraph.statementId,
        });
      });
    };
  }, [canEdit, documentId, paragraph.statementId, paragraph.statement, userId, displayName]);

  // Handle text change with RTDB sync
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      setDraftText(newText);

      // Update draft in RTDB (debounced internally by manager)
      const cursorPosition = e.target.selectionStart;
      editorManagerRef.current.updateDraft(newText, cursorPosition);
    },
    []
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!draftText.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(draftText);
    } catch (error) {
      logError(error, {
        operation: 'paragraphEditor.handleSave',
        paragraphId: paragraph.statementId,
        userId,
      });
    } finally {
      setIsSaving(false);
    }
  }, [draftText, isSaving, onSave, paragraph.statementId, userId]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setDraftText(paragraph.statement);
    onCancel();
  }, [paragraph.statement, onCancel]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draftText]);

  if (!canEdit) {
    return null;
  }

  const hasChanges = draftText.trim() !== paragraph.statement.trim();

  return (
    <div className={styles.paragraphEditor}>
      {/* Active editors indicator */}
      {activeEditors.length > 0 && (
        <div className={styles.activeEditors}>
          <span className={styles.activeEditorsLabel}>
            {t('paragraph.editing.activeEditors')}:
          </span>
          {activeEditors.map((editor) => (
            <span
              key={editor.userId}
              className={styles.editorBadge}
              style={{ backgroundColor: editor.color }}
            >
              {editor.displayName}
            </span>
          ))}
        </div>
      )}

      {/* Text editor */}
      <textarea
        ref={textareaRef}
        value={draftText}
        onChange={handleTextChange}
        className={styles.textarea}
        placeholder={t('paragraph.editing.placeholder')}
        disabled={isSaving}
        autoFocus
      />

      {/* Action buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleCancel}
          className={styles.cancelButton}
          disabled={isSaving}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={styles.saveButton}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {/* Draft sync indicator */}
      <div className={styles.syncStatus}>
        <span className={styles.syncIndicator}>
          {t('paragraph.editing.draftSynced')}
        </span>
      </div>
    </div>
  );
}

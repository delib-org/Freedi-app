'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion } from '@freedi/shared-types';
import { useUIStore } from '@/store/uiStore';
import { useSuggestionDraft } from '@/hooks/useSuggestionDraft';
import { useAutoLogin } from '@/hooks/useAutoLogin';
import { LiveEditingManager } from '@/lib/realtime/liveEditingSession';
import type { LiveEditingSession, ActiveEditor } from '@/lib/realtime/liveEditingSession';
import { htmlToMarkdown, markdownToHtml } from '@/lib/utils/htmlToMarkdown';
import { API_ROUTES, SUGGESTIONS } from '@/constants/common';
import styles from './SuggestionModal.module.scss';

interface SuggestionModalProps {
  paragraphId: string;
  documentId: string;
  originalContent: string;
  existingSuggestion?: Suggestion | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function SuggestionModal({
  paragraphId,
  documentId,
  originalContent,
  existingSuggestion,
  onClose,
  onSuccess,
}: SuggestionModalProps) {
  const { t } = useTranslation();
  const { incrementSuggestionCount, addUserInteraction } = useUIStore();
  const user = useAutoLogin(); // Auto-login anonymously if not logged in

  // State
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Real-time collaborative editing
  const liveEditingManager = useRef<LiveEditingManager | null>(null);
  const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Convert HTML original content to Markdown for user-friendly editing
  const markdownOriginalContent = useMemo(
    () => htmlToMarkdown(originalContent),
    [originalContent]
  );

  // Draft handling
  const {
    suggestedContent,
    reasoning,
    setSuggestedContent,
    setReasoning,
    clearDraft,
    hasDraft,
  } = useSuggestionDraft({ paragraphId });

  // Initialize real-time editing session
  useEffect(() => {
    if (!user) return;

    const manager = new LiveEditingManager();
    liveEditingManager.current = manager;

    // Join editing session for this paragraph
    manager
      .joinSession(
        documentId,
        paragraphId,
        user.uid,
        user.displayName || 'Anonymous',
        suggestedContent || markdownOriginalContent
      )
      .catch((error) => {
        console.error('Failed to join editing session:', error);
      });

    // Subscribe to session updates to see other editors
    const unsubscribe = manager.subscribeToSession((session: LiveEditingSession | null) => {
      if (session) {
        const editors = manager.getActiveEditors(session);
        setActiveEditors(editors);

        // Update draft content from RTDB if it changed from another user
        if (session.draftContent !== suggestedContent) {
          setSuggestedContent(session.draftContent);
        }
      }
    });

    return () => {
      unsubscribe();
      manager.cleanup();
    };
  }, [user, documentId, paragraphId, markdownOriginalContent, suggestedContent, setSuggestedContent]);

  // Handle textarea changes with real-time sync
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      const cursorPosition = e.target.selectionStart || 0;

      setSuggestedContent(newContent);

      // Update RTDB for real-time collaboration (300ms debounced)
      if (liveEditingManager.current) {
        liveEditingManager.current.updateDraft(newContent, cursorPosition);
      }
    },
    [setSuggestedContent]
  );

  // Pre-fill if editing existing suggestion (convert HTML to Markdown)
  useEffect(() => {
    if (existingSuggestion && !hasDraft) {
      const markdownContent = htmlToMarkdown(existingSuggestion.suggestedContent);
      setSuggestedContent(markdownContent);
      setReasoning(existingSuggestion.reasoning || '');
    }
  }, [existingSuggestion, hasDraft, setSuggestedContent, setReasoning]);

  // Initialize with markdown original content for new suggestions
  useEffect(() => {
    if (!existingSuggestion && !hasDraft && !suggestedContent) {
      setSuggestedContent(markdownOriginalContent);
    }
  }, [existingSuggestion, hasDraft, suggestedContent, markdownOriginalContent, setSuggestedContent]);

  const isEditing = !!existingSuggestion;
  const isValid = suggestedContent.trim().length >= SUGGESTIONS.MIN_LENGTH;

  const handleSubmit = async () => {
    console.info('[SuggestionModal] handleSubmit called', {
      isValid,
      submitState,
      hasUser: !!user,
      userId: user?.uid,
    });

    if (!isValid || submitState === 'submitting') {
      console.info('[SuggestionModal] Submit blocked:', { isValid, submitState });
      return;
    }

    if (!user) {
      console.error('[SuggestionModal] No user - cannot submit');
      setErrorMessage('Please wait for authentication to complete...');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      // Convert Markdown to HTML before submitting
      const htmlContent = markdownToHtml(suggestedContent.trim());

      const method = isEditing ? 'PUT' : 'POST';
      const body = isEditing
        ? {
            suggestionId: existingSuggestion.suggestionId,
            suggestedContent: htmlContent,
            reasoning: reasoning.trim(),
          }
        : {
            suggestedContent: htmlContent,
            reasoning: reasoning.trim(),
            documentId,
            originalContent,
          };

      console.info('[SuggestionModal] Sending request:', {
        method,
        url: API_ROUTES.SUGGESTIONS(paragraphId),
        bodyKeys: Object.keys(body),
      });

      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.info('[SuggestionModal] Response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[SuggestionModal] Error response:', data);
        throw new Error(data.error || 'Failed to submit suggestion');
      }

      const responseData = await response.json();
      console.info('[SuggestionModal] Success:', responseData);

      setSubmitState('success');
      clearDraft();

      // Increment count only for new suggestions
      if (!isEditing) {
        incrementSuggestionCount(paragraphId);
      }

      // Mark paragraph as interacted
      addUserInteraction(paragraphId);

      // Close after short delay to show success
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 500);
    } catch (error) {
      console.error('[SuggestionModal] Submit error:', error);
      setSubmitState('error');
      setErrorMessage(error instanceof Error ? error.message : t('Failed to submit suggestion'));
    }
  };

  return (
    <div className={styles.container}>
      {/* Collapsible original content section */}
      <div className={styles.originalSection}>
        <button
          type="button"
          className={styles.originalToggle}
          onClick={() => setIsOriginalExpanded(!isOriginalExpanded)}
        >
          <span>{t('Original Text')}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={isOriginalExpanded ? styles.rotated : ''}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isOriginalExpanded && (
          <div className={styles.originalContent}>
            <p>{originalContent}</p>
          </div>
        )}
      </div>

      {/* Active editors indicator */}
      {activeEditors.length > 0 && (
        <div className={styles.activeEditors}>
          <span className={styles.activeEditorsLabel}>{t('Also editing')}:</span>
          {activeEditors.map((editor) => (
            <span
              key={editor.userId}
              className={styles.activeEditorBadge}
              style={{ backgroundColor: editor.color }}
              title={editor.displayName}
            >
              {editor.displayName.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* Suggestion textarea with real-time collaboration */}
      <div className={styles.field}>
        <label htmlFor="suggested-content">{t('Your Suggested Text')}</label>
        <textarea
          ref={textareaRef}
          id="suggested-content"
          value={suggestedContent}
          onChange={handleContentChange}
          placeholder={t('Write your alternative version...')}
          rows={5}
          maxLength={SUGGESTIONS.MAX_LENGTH}
          disabled={submitState === 'submitting'}
        />
        <span className={styles.charCount}>
          {suggestedContent.length}/{SUGGESTIONS.MAX_LENGTH}
        </span>
      </div>

      {/* Optional reasoning textarea */}
      <div className={styles.field}>
        <label htmlFor="reasoning">
          {t('Why is this better?')} <span className={styles.optional}>({t('optional')})</span>
        </label>
        <textarea
          id="reasoning"
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder={t('Explain your reasoning...')}
          rows={3}
          maxLength={SUGGESTIONS.MAX_REASONING_LENGTH}
          disabled={submitState === 'submitting'}
        />
      </div>

      {/* Minimum length hint */}
      {suggestedContent.length > 0 && suggestedContent.length < SUGGESTIONS.MIN_LENGTH && (
        <p className={styles.hint}>
          {t('Suggestion must be at least')} {SUGGESTIONS.MIN_LENGTH} {t('characters')}
        </p>
      )}

      {/* Error message */}
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      {/* Success message */}
      {submitState === 'success' && (
        <p className={styles.success}>
          {isEditing ? t('Suggestion updated') : t('Suggestion submitted')}
        </p>
      )}

      {/* Action buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
          disabled={submitState === 'submitting'}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={submitState === 'submitting' || !isValid}
        >
          {submitState === 'submitting' ? (
            <>
              <span className={styles.spinner} />
              {t('Submitting...')}
            </>
          ) : isEditing ? (
            t('Update Suggestion')
          ) : (
            t('Submit Suggestion')
          )}
        </button>
      </div>
    </div>
  );
}

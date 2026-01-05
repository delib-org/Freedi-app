'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion } from '@freedi/shared-types';
import { useUIStore } from '@/store/uiStore';
import { useSuggestionDraft } from '@/hooks/useSuggestionDraft';
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

  // State
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Draft handling
  const {
    suggestedContent,
    reasoning,
    setSuggestedContent,
    setReasoning,
    clearDraft,
    hasDraft,
  } = useSuggestionDraft({ paragraphId });

  // Pre-fill if editing existing suggestion
  useEffect(() => {
    if (existingSuggestion && !hasDraft) {
      setSuggestedContent(existingSuggestion.suggestedContent);
      setReasoning(existingSuggestion.reasoning || '');
    }
  }, [existingSuggestion, hasDraft, setSuggestedContent, setReasoning]);

  const isEditing = !!existingSuggestion;
  const isValid = suggestedContent.trim().length >= SUGGESTIONS.MIN_LENGTH;

  const handleSubmit = async () => {
    if (!isValid || submitState === 'submitting') return;

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const method = isEditing ? 'PUT' : 'POST';
      const body = isEditing
        ? {
            suggestionId: existingSuggestion.suggestionId,
            suggestedContent: suggestedContent.trim(),
            reasoning: reasoning.trim(),
          }
        : {
            suggestedContent: suggestedContent.trim(),
            reasoning: reasoning.trim(),
            documentId,
            originalContent,
          };

      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit suggestion');
      }

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

      {/* Suggestion textarea */}
      <div className={styles.field}>
        <label htmlFor="suggested-content">{t('Your Suggested Text')}</label>
        <textarea
          id="suggested-content"
          value={suggestedContent}
          onChange={(e) => setSuggestedContent(e.target.value)}
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

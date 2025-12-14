'use client';

import { FC, useState } from 'react';
import type { SplitSuggestion } from '@/types/api';
import styles from './MultiSuggestionPreview.module.scss';

interface MultiSuggestionPreviewProps {
  originalText: string;
  suggestions: SplitSuggestion[];
  onConfirm: (suggestions: SplitSuggestion[]) => void;
  onDismiss: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const MultiSuggestionPreview: FC<MultiSuggestionPreviewProps> = ({
  originalText,
  suggestions: initialSuggestions,
  onConfirm,
  onDismiss,
  onBack,
  isSubmitting,
}) => {
  const [suggestions, setSuggestions] = useState<SplitSuggestion[]>(initialSuggestions);

  const handleUpdateSuggestion = (id: string, updates: Partial<SplitSuggestion>) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleToggleRemove = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isRemoved: !s.isRemoved } : s))
    );
  };

  const activeSuggestions = suggestions.filter((s) => !s.isRemoved);
  const activeSuggestionsCount = activeSuggestions.length;

  return (
    <div className={styles.multiPreview}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          disabled={isSubmitting}
        >
          &larr; Back
        </button>
        <h2 className={styles.title}>Multiple Ideas Detected</h2>
      </div>

      <p className={styles.description}>
        We detected multiple ideas in your submission. You can submit them separately for better visibility and voting.
      </p>

      <div className={styles.original}>
        <div className={styles.originalLabel}>Your original text:</div>
        <div className={styles.originalText}>{originalText}</div>
      </div>

      <div className={styles.suggestionsList}>
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.id}
            className={`${styles.suggestionCard} ${suggestion.isRemoved ? styles.removed : ''}`}
          >
            <div className={styles.cardHeader}>
              <span className={styles.cardNumber}>{index + 1}</span>
              <button
                type="button"
                className={`${styles.actionButton} ${suggestion.isRemoved ? styles.restore : styles.remove}`}
                onClick={() => handleToggleRemove(suggestion.id)}
                disabled={isSubmitting}
              >
                {suggestion.isRemoved ? 'Restore' : 'Remove'}
              </button>
            </div>

            <input
              type="text"
              className={styles.titleInput}
              value={suggestion.title}
              onChange={(e) => handleUpdateSuggestion(suggestion.id, { title: e.target.value })}
              placeholder="Title"
              disabled={suggestion.isRemoved || isSubmitting}
            />

            <textarea
              className={styles.descriptionInput}
              value={suggestion.description}
              onChange={(e) => handleUpdateSuggestion(suggestion.id, { description: e.target.value })}
              placeholder="Description"
              disabled={suggestion.isRemoved || isSubmitting}
              rows={2}
            />

            {suggestion.originalText && (
              <div className={styles.cardOriginal}>
                From: &quot;{suggestion.originalText}&quot;
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          disabled={isSubmitting}
        >
          Submit Original As-Is
        </button>
        <button
          type="button"
          className={styles.confirmButton}
          onClick={() => onConfirm(activeSuggestions)}
          disabled={isSubmitting || activeSuggestionsCount === 0}
        >
          {isSubmitting ? 'Submitting...' : `Submit ${activeSuggestionsCount} Suggestions`}
        </button>
      </div>
    </div>
  );
};

export default MultiSuggestionPreview;

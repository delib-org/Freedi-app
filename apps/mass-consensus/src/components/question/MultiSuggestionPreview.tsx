'use client';

import { FC, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
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
  const { t } = useTranslation();
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
    <div className={styles.container}>
      {/* Header with gradient background */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          disabled={isSubmitting}
          aria-label={t('Back to edit')}
        >
          <span aria-hidden="true">&larr;</span> {t('Back')}
        </button>

        <div className={styles.headerContent}>
          <div className={styles.iconWrapper} aria-hidden="true">
            <span role="img" aria-label={t('Multiple ideas')}>&#x2728;</span>
          </div>
          <h2 className={styles.title}>{t('Multiple Ideas Detected')}</h2>
          <p className={styles.subtitle}>
            {t('We found several ideas in your text. Submit them separately for better visibility and voting.')}
          </p>
        </div>
      </div>

      {/* Main content area */}
      <div className={styles.content}>
        {/* Original text section */}
        <div className={styles.originalSection}>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true">&#x1F4DD;</span>
            {t('Your original text')}
          </div>
          <div className={styles.originalCard}>
            <p className={styles.originalText}>{originalText}</p>
          </div>
        </div>

        {/* Suggestions section */}
        <div className={styles.suggestionsSection}>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true">&#x1F4A1;</span>
            {t('Separated into')} {suggestions.length} {suggestions.length === 1 ? t('suggestion') : t('suggestions')}
          </div>

          <div className={styles.suggestionsList} role="list">
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.id}
                className={`${styles.suggestionCard} ${suggestion.isRemoved ? styles.removed : ''}`}
                role="listitem"
                aria-label={`${t('Suggestion')} ${index + 1}`}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.cardNumberWrapper}>
                    <span className={styles.cardNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className={styles.cardLabel}>
                      {suggestion.isRemoved ? t('Removed') : t('Suggestion')}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`${styles.actionButton} ${suggestion.isRemoved ? styles.restore : styles.remove}`}
                    onClick={() => handleToggleRemove(suggestion.id)}
                    disabled={isSubmitting}
                    aria-label={suggestion.isRemoved
                      ? `${t('Restore')} ${t('suggestion')} ${index + 1}`
                      : `${t('Remove')} ${t('suggestion')} ${index + 1}`
                    }
                  >
                    {suggestion.isRemoved ? (
                      <>
                        <span aria-hidden="true">&#x21A9;</span>
                        {t('Restore')}
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">&#x2715;</span>
                        {t('Remove')}
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.inputWrapper}>
                    <label
                      className={styles.inputLabel}
                      htmlFor={`title-${suggestion.id}`}
                    >
                      {t('Title')}
                    </label>
                    <input
                      id={`title-${suggestion.id}`}
                      type="text"
                      className={styles.titleInput}
                      value={suggestion.title}
                      onChange={(e) => handleUpdateSuggestion(suggestion.id, { title: e.target.value })}
                      placeholder={t('Enter a clear, concise title')}
                      disabled={suggestion.isRemoved || isSubmitting}
                      aria-describedby={suggestion.isRemoved ? `removed-${suggestion.id}` : undefined}
                    />
                  </div>

                  <div className={styles.inputWrapper}>
                    <label
                      className={styles.inputLabel}
                      htmlFor={`description-${suggestion.id}`}
                    >
                      {t('Description')}
                    </label>
                    <textarea
                      id={`description-${suggestion.id}`}
                      className={styles.descriptionInput}
                      value={suggestion.description}
                      onChange={(e) => handleUpdateSuggestion(suggestion.id, { description: e.target.value })}
                      placeholder={t('Add more details about this idea')}
                      disabled={suggestion.isRemoved || isSubmitting}
                      rows={2}
                    />
                  </div>
                </div>

                {suggestion.originalText && (
                  <div className={styles.cardOriginal}>
                    <span className={styles.originalPrefix}>{t('From')}:</span>
                    <span>&quot;{suggestion.originalText}&quot;</span>
                  </div>
                )}

                {suggestion.isRemoved && (
                  <span id={`removed-${suggestion.id}`} className="sr-only">
                    {t('This suggestion has been removed and will not be submitted')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Help tip */}
        <div className={styles.helpTip} role="note">
          <span className={styles.helpIcon} aria-hidden="true">&#x1F4A1;</span>
          <p className={styles.helpText}>
            {t('Tip: Submitting ideas separately helps others find and vote on each one individually, leading to better consensus.')}
          </p>
        </div>

        {/* Footer with action buttons */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={onDismiss}
            disabled={isSubmitting}
          >
            {t('Submit Original As-Is')}
          </button>

          <button
            type="button"
            className={styles.confirmButton}
            onClick={() => onConfirm(activeSuggestions)}
            disabled={isSubmitting || activeSuggestionsCount === 0}
            aria-live="polite"
          >
            {isSubmitting ? (
              <span className={styles.loading}>
                <span className={styles.spinner} aria-hidden="true" />
                {t('Submitting...')}
              </span>
            ) : (
              <>
                {t('Submit')}
                <span className={styles.confirmCount} aria-label={`${activeSuggestionsCount} ${activeSuggestionsCount === 1 ? t('suggestion') : t('suggestions')}`}>
                  {activeSuggestionsCount}
                </span>
                {activeSuggestionsCount === 1 ? t('Suggestion') : t('Suggestions')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiSuggestionPreview;

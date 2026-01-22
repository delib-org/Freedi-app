'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import { SUGGESTIONS } from '@/constants/common';
import styles from './SuggestionPrompt.module.scss';

interface SuggestionPromptProps {
  paragraphId: string;
  onOpenSuggestions: () => void;
  onDismiss: () => void;
}

export default function SuggestionPrompt({
  paragraphId,
  onOpenSuggestions,
  onDismiss,
}: SuggestionPromptProps) {
  const { t } = useTranslation();
  const { dismissSuggestionPrompt, isSuggestionPromptDismissed } = useUIStore();
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Check if already dismissed
  const isDismissed = isSuggestionPromptDismissed(paragraphId);

  // Handle dismiss with animation
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      dismissSuggestionPrompt(paragraphId);
      onDismiss();
    }, 300); // Match animation duration
  }, [dismissSuggestionPrompt, paragraphId, onDismiss]);

  // Animate in after a short delay
  useEffect(() => {
    if (isDismissed) {
      onDismiss();

      return;
    }

    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, SUGGESTIONS.POST_COMMENT_PROMPT_DELAY_MS);

    // Auto-dismiss after delay
    const dismissTimer = setTimeout(() => {
      handleDismiss();
    }, SUGGESTIONS.AUTO_DISMISS_DELAY_MS + SUGGESTIONS.POST_COMMENT_PROMPT_DELAY_MS);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [isDismissed, onDismiss, handleDismiss]);

  const handleOpenSuggestions = () => {
    dismissSuggestionPrompt(paragraphId);
    onOpenSuggestions();
  };

  if (isDismissed || !isVisible) {
    return null;
  }

  return (
    <div className={`${styles.prompt} ${isExiting ? styles.exiting : ''}`}>
      <div className={styles.content}>
        <div className={styles.icon}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
          </svg>
        </div>
        <p className={styles.text}>{t('Want to suggest better wording?')}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={handleDismiss}
        >
          {t('Not now')}
        </button>
        <button
          type="button"
          className={styles.suggestButton}
          onClick={handleOpenSuggestions}
        >
          {t('Suggest')}
        </button>
      </div>
    </div>
  );
}

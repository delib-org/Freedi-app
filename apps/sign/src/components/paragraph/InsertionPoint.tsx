'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Paragraph } from '@/types';
import SuggestionThread from '../suggestions/SuggestionThread';
import styles from './InsertionPoint.module.scss';

interface InsertionPointProps {
  paragraph: Paragraph;
  documentId: string;
  isLoggedIn: boolean;
  enableSuggestions: boolean;
  /** When true, hide display names in suggestions */
  hideUserIdentity?: boolean;
  /** When true, users must sign in with Google to interact */
  requireGoogleLogin?: boolean;
  isAnonymous?: boolean;
}

/**
 * InsertionPoint - renders a subtle "+" between paragraphs.
 *
 * When clicked, opens a SuggestionThread for the insertion point,
 * allowing users to suggest new paragraph content. Suggestions are
 * children of the insertion point Statement, reusing the existing
 * suggestion/evaluation infrastructure.
 */
export default function InsertionPoint({
  paragraph,
  documentId,
  isLoggedIn,
  enableSuggestions,
  hideUserIdentity = false,
}: InsertionPointProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTriggerClick = useCallback(() => {
    if (!enableSuggestions) return;
    setIsExpanded(true);
  }, [enableSuggestions]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // Don't render consumed insertion points
  if (paragraph.consumed) return null;

  // Don't show if suggestions are disabled
  if (!enableSuggestions && !isExpanded) return null;

  const wrapperClass = [
    styles.insertionPoint,
    isExpanded ? styles['insertionPoint--expanded'] : '',
    paragraph.consumed ? styles['insertionPoint--consumed'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClass} role="group" aria-label={t('suggestNewParagraph') || 'Suggest new paragraph'}>
      <div className={styles['insertionPoint__line']} />
      {!isExpanded && (
        <button
          className={styles['insertionPoint__trigger']}
          onClick={handleTriggerClick}
          aria-label={t('addSuggestionBetweenParagraphs') || 'Add suggestion between paragraphs'}
          type="button"
          disabled={!isLoggedIn || !enableSuggestions}
          title={
            !isLoggedIn
              ? (t('signInToSuggest') || 'Sign in to suggest')
              : (t('suggestNewParagraph') || 'Suggest a new paragraph here')
          }
        >
          +
        </button>
      )}
      {isExpanded && (
        <div className={styles['insertionPoint__body']}>
          <SuggestionThread
            paragraphId={paragraph.paragraphId}
            documentId={documentId}
            originalContent=""
            onClose={handleClose}
            hideUserIdentity={hideUserIdentity}
          />
        </div>
      )}
    </div>
  );
}

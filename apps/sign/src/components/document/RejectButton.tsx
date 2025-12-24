'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import styles from './DocumentView.module.scss';

interface RejectButtonProps {
  disabled?: boolean;
  isRejected?: boolean;
}

/**
 * Reject Document button with animated states
 * Shows spinner during rejection and X mark on confirmation or when already rejected
 */
export default function RejectButton({ disabled = false, isRejected = false }: RejectButtonProps) {
  const { t } = useTranslation();
  const { signingAnimationState, isSubmitting } = useUIStore();

  // Determine button classes based on animation state and rejected status
  const getButtonClasses = (): string => {
    const classes = [styles.rejectButton];

    if (signingAnimationState === 'rejecting') {
      classes.push(styles.rejectButtonRejecting);
    } else if (signingAnimationState === 'rejected') {
      classes.push(styles.rejectButtonRejected);
    } else if (isRejected) {
      // Persistent "already rejected" state - uses different styling
      classes.push(styles.rejectButtonAlreadyRejected);
    }

    return classes.join(' ');
  };

  // Render content based on animation state and rejected status
  const renderContent = () => {
    // Rejecting animation state (temporary during animation)
    if (signingAnimationState === 'rejecting') {
      return (
        <>
          <span className={styles.spinnerIcon} aria-label={t('rejecting') || 'Rejecting'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="31.4 31.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className={styles.buttonText}>{t('rejectingEllipsis') || 'Rejecting...'}</span>
          <span className="visually-hidden">{t('rejectingDocument') || 'Rejecting document...'}</span>
        </>
      );
    }

    // Rejected animation state (temporary during animation)
    if (signingAnimationState === 'rejected') {
      return (
        <>
          <span className={styles.crossmarkIconInline} aria-label={t('rejected') || 'Rejected'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
          <span className={styles.buttonText}>{t('rejected') || 'Rejected'}</span>
          <span className="visually-hidden">{t('documentRejectedSuccessfully') || 'Document rejected'}</span>
        </>
      );
    }

    // Already rejected state (persistent)
    if (isRejected) {
      return (
        <>
          <span className={styles.crossmarkIconInline} aria-label={t('rejected') || 'Rejected'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
          <span className={styles.buttonText}>{t('rejected') || 'Rejected'}</span>
          <span className="visually-hidden">{t('documentIsRejected') || 'Document is rejected'}</span>
        </>
      );
    }

    // Default idle state
    return <span className={styles.buttonText}>{t('rejectDocument') || 'Reject Document'}</span>;
  };

  return (
    <button
      type="button"
      className={getButtonClasses()}
      data-action="reject"
      disabled={disabled || isSubmitting || isRejected}
      aria-busy={signingAnimationState === 'rejecting'}
    >
      {renderContent()}
    </button>
  );
}

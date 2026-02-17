'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useUIStore } from '@/store/uiStore';
import styles from './DocumentView.module.scss';

interface SignButtonProps {
  disabled?: boolean;
  isSigned?: boolean;
  /** Real-time count of users who signed */
  count?: number;
}

/**
 * Sign Document button with animated states
 * Shows spinner during signing and checkmark on success or when already signed
 */
export default function SignButton({ disabled = false, isSigned = false, count }: SignButtonProps) {
  const { t } = useTranslation();
  const { signingAnimationState, isSubmitting } = useUIStore();

  // Determine button classes based on animation state and signed status
  const getButtonClasses = (): string => {
    const classes = [styles.signButton];

    if (signingAnimationState === 'signing') {
      classes.push(styles.signButtonSigning);
    } else if (signingAnimationState === 'success' || isSigned) {
      classes.push(styles.signButtonSigned);
    }

    return classes.join(' ');
  };

  // Render content based on animation state and signed status
  const renderContent = () => {
    // Success animation state (temporary during animation)
    if (signingAnimationState === 'success') {
      return (
        <>
          <span className={styles.checkmarkIconInline} aria-label={t('success') || 'Success'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className={styles.buttonText}>{t('signed') || 'Signed'}</span>
          <span className="visually-hidden">{t('documentSignedSuccessfully') || 'Document signed successfully'}</span>
        </>
      );
    }

    // Signing in progress
    if (signingAnimationState === 'signing') {
      return (
        <>
          <span className={styles.spinnerIcon} aria-label={t('signing') || 'Signing'}>
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
          <span className={styles.buttonText}>{t('signingEllipsis') || 'Signing...'}</span>
          <span className="visually-hidden">{t('signingDocument') || 'Signing document...'}</span>
        </>
      );
    }

    // Already signed state (persistent)
    if (isSigned) {
      return (
        <>
          <span className={styles.checkmarkIconInline} aria-label={t('signed') || 'Signed'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className={styles.buttonText}>{t('signed') || 'Signed'}</span>
          <span className="visually-hidden">{t('documentIsSigned') || 'Document is signed'}</span>
        </>
      );
    }

    // Default idle state
    return <span className={styles.buttonText}>{t('signDocument') || 'Sign Document'}</span>;
  };

  const showCount = count !== undefined && count > 0;
  const formatter = showCount ? new Intl.NumberFormat() : null;

  return (
    <button
      type="button"
      className={getButtonClasses()}
      data-action="sign"
      disabled={disabled || isSubmitting || isSigned}
      aria-busy={signingAnimationState === 'signing'}
    >
      {renderContent()}
      {showCount && formatter && (
        <span className={styles.buttonCount} aria-label={`${count} ${t('signed') || 'signed'}`}>
          {formatter.format(count)}
        </span>
      )}
    </button>
  );
}

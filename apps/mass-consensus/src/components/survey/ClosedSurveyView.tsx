'use client';

import { useState, FormEvent } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError } from '@/lib/utils/errorHandling';
import WizColAttribution from '../shared/WizColAttribution';
import styles from './Survey.module.scss';

interface ClosedSurveyViewProps {
  surveyTitle: string;
  primaryStatementId: string;
}

export default function ClosedSurveyView({
  surveyTitle,
  primaryStatementId,
}: ClosedSurveyViewProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch(
        `/api/statements/${primaryStatementId}/subscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: 'mass-consensus-closed',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Subscription failed: ${response.status}`);
      }

      setIsSubscribed(true);
    } catch (error) {
      logError(error, {
        operation: 'ClosedSurveyView.handleSubmit',
        metadata: { primaryStatementId },
      });
      setErrorMsg(t('subscriptionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.closedSurvey}>
      <div className={styles.closedSurveyBadge} aria-hidden="true">
        <LockIcon />
      </div>

      <h1 className={styles.closedSurveyTitle}>{t('surveyClosedTitle')}</h1>
      {surveyTitle && <p className={styles.closedSurveyLead}>{surveyTitle}</p>}
      <p className={styles.closedSurveyMessage}>{t('surveyClosedMessage')}</p>

      {!isSubscribed ? (
        <div className={styles.emailSignup}>
          <h2 className={styles.emailTitle}>{t('notifyMeAboutUpdates')}</h2>
          <p className={styles.emailDescription}>
            {t('notifyMeDescription')}
          </p>
          <form className={styles.emailForm} onSubmit={handleSubmit}>
            <input
              type="email"
              className={styles.emailInput}
              placeholder={t('enterEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label={t('enterEmail')}
            />
            <button
              type="submit"
              className={styles.emailSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('subscribing') : t('notifyMe')}
            </button>
          </form>
          {errorMsg && (
            <p className={styles.closedSurveyError} role="alert">
              {errorMsg}
            </p>
          )}
        </div>
      ) : (
        <div className={styles.emailSignup}>
          <p className={styles.closedSurveySuccess} role="status">
            {t('subscribedSuccessfully')}
          </p>
        </div>
      )}

      <WizColAttribution />
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

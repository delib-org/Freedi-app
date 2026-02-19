'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { trackEmailSubscribed } from '@/lib/analytics';
import { logError } from '@/lib/utils/errorHandling';
import styles from './CompletionScreen.module.scss';
import AchievementBadge, { BadgeType } from './AchievementBadge';

interface CompletionScreenProps {
  questionId: string;
  userId: string;
  participantCount: number;
  solutionsEvaluated: number;
  hasSubmittedSolution: boolean;
  estimatedDays?: number;
  onClose: () => void;
}

export default function CompletionScreen({
  questionId,
  userId,
  participantCount,
  solutionsEvaluated,
  hasSubmittedSolution,
  estimatedDays = 3,
  onClose,
}: CompletionScreenProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine which badges the user earned
  const earnedBadges: BadgeType[] = [];

  if (participantCount <= 50) {
    earnedBadges.push('early-contributor');
  }
  if (solutionsEvaluated >= 5) {
    earnedBadges.push('thoughtful-evaluator');
  }
  if (hasSubmittedSolution) {
    earnedBadges.push('solution-creator');
  }
  earnedBadges.push('consensus-participant');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError(t('Please enter your email'));
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('Invalid email'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/statements/${questionId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to subscribe');
      }

      setIsSubscribed(true);
      trackEmailSubscribed(questionId, userId);
    } catch (err) {
      logError(err, {
        operation: 'CompletionScreen.handleSubscribe',
        metadata: { questionId },
      });
      setError(t('Something went wrong. Please try again!'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Scrollable Content */}
        <div className={styles.scrollableContent}>
          {/* Celebration Animation */}
          <div className={styles.celebration}>
            <div className={styles.checkmark}>
              <svg viewBox="0 0 52 52" className={styles.checkmarkSvg}>
                <circle className={styles.checkmarkCircle} cx="26" cy="26" r="25" fill="none" />
                <path className={styles.checkmarkCheck} fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            <div className={styles.confetti}>
              {[...Array(12)].map((_, i) => (
                <div key={i} className={styles.confettiPiece} style={{ '--delay': `${i * 0.1}s` } as React.CSSProperties} />
              ))}
            </div>
          </div>

          {/* Title */}
          <h1 className={styles.title}>{t('Thank You')}</h1>
          <p className={styles.subtitle}>{t('Thank you for your participation')}</p>

          {/* Stats */}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{solutionsEvaluated}</span>
              <span className={styles.statLabel}>{t('Solutions')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{participantCount}</span>
              <span className={styles.statLabel}>{t('Total participants')}</span>
            </div>
          </div>

          {/* Achievement Badges */}
          <div className={styles.badgesSection}>
            <h3 className={styles.badgesTitle}>{t('Achievements Earned')}</h3>
            <div className={styles.badges}>
              {earnedBadges.map((badge) => (
                <AchievementBadge key={badge} type={badge} />
              ))}
            </div>
          </div>

          {/* Results Timeline */}
          <div className={styles.timeline}>
            <div className={styles.timelineIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <p className={styles.timelineText}>
              {t('Results')} <strong>{estimatedDays}</strong>
            </p>
          </div>

          {/* Email Subscription */}
          {!isSubscribed ? (
            <form className={styles.subscribeForm} onSubmit={handleSubscribe}>
              <p className={styles.subscribeLabel}>{t('Please leave your email to receive updates')}</p>
              <div className={styles.inputGroup}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('your@email.com')}
                  className={styles.emailInput}
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  className={styles.subscribeButton}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t('Submitting...') : t('Submit')}
                </button>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </form>
          ) : (
            <div className={styles.subscribed}>
              <span className={styles.subscribedIcon}>✓</span>
              <p>{t('You have successfully registered to receive updates. We will send you a message when there is news.')}</p>
            </div>
          )}
        </div>

        {/* Fixed Footer - Continue Evaluating Button */}
        <div className={styles.fixedFooter}>
          <button className={styles.closeButton} onClick={onClose}>
            {t('Continue Evaluating')}
          </button>
        </div>
      </div>
    </div>
  );
}

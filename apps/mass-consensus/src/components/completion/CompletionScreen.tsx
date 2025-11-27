'use client';

import { useState } from 'react';
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
      setError('Please enter your email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email');
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
    } catch (err) {
      console.error('Subscription error:', err);
      setError('Failed to subscribe. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
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
        <h1 className={styles.title}>Thank You!</h1>
        <p className={styles.subtitle}>Your voice matters in shaping collective decisions</p>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{solutionsEvaluated}</span>
            <span className={styles.statLabel}>Solutions Evaluated</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{participantCount}</span>
            <span className={styles.statLabel}>Total Participants</span>
          </div>
        </div>

        {/* Achievement Badges */}
        <div className={styles.badgesSection}>
          <h3 className={styles.badgesTitle}>Achievements Earned</h3>
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
            Results will be ready in approximately <strong>{estimatedDays} days</strong>
          </p>
        </div>

        {/* Email Subscription */}
        {!isSubscribed ? (
          <form className={styles.subscribeForm} onSubmit={handleSubscribe}>
            <p className={styles.subscribeLabel}>Get notified when results are ready:</p>
            <div className={styles.inputGroup}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={styles.emailInput}
                disabled={isSubmitting}
              />
              <button
                type="submit"
                className={styles.subscribeButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Subscribing...' : 'Notify Me'}
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        ) : (
          <div className={styles.subscribed}>
            <span className={styles.subscribedIcon}>✓</span>
            <p>We&apos;ll email you when results are ready!</p>
          </div>
        )}

        {/* Close Button */}
        <button className={styles.closeButton} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

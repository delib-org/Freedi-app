'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import LandingPage from '@/components/landing/LandingPage';
import styles from './home.module.scss';

/**
 * Home page - Shows landing page for new users, decision point for authenticated users
 */
export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [surveyLink, setSurveyLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [showMainPage, setShowMainPage] = useState(false);

  const handleSurveyLink = () => {
    if (!surveyLink.trim()) {
      setLinkError(t('enterSurveyLink') || 'Please enter a survey link');
      return;
    }

    setLinkError('');

    // Extract survey ID from various formats
    let surveyId = surveyLink.trim();

    // Handle full URLs
    if (surveyLink.includes('/s/')) {
      const match = surveyLink.match(/\/s\/([^/?]+)/);
      if (match) {
        surveyId = match[1];
      }
    }

    // Navigate to survey
    router.push(`/s/${surveyId}`);
  };

  const handleGetStarted = () => {
    setShowMainPage(true);
  };

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // Show landing page for non-authenticated users who haven't clicked "Get Started"
  if (!isAuthenticated && !showMainPage) {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>Mass Consensus</div>
        {isLoading ? null : isAuthenticated ? (
          <Link href="/admin/surveys" className={styles.headerLink}>
            {t('dashboard') || 'Dashboard'}
          </Link>
        ) : (
          <Link href="/login" className={styles.headerLink}>
            {t('signIn') || 'Sign In'}
          </Link>
        )}
      </header>

      {/* Hero Section */}
      <main className={styles.main}>
        <h1 className={styles.title}>Mass Consensus</h1>
        <p className={styles.subtitle}>
          {t('gatherFeedback') || 'Gather feedback at scale with multi-question surveys'}
        </p>

        {/* Two-Path Selection */}
        <div className={styles.pathGrid}>
          {/* Participant Path */}
          <div className={styles.pathCard}>
            <div className={styles.pathIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                <path d="M17 21v-2a4 4 0 0 0 -4 -4h-2a4 4 0 0 0 -4 4v2" />
              </svg>
            </div>
            <h2 className={styles.pathTitle}>
              {t('forParticipants') || 'For Participants'}
            </h2>
            <p className={styles.pathDescription}>
              {t('participantDescription') || 'Got a survey link? Enter it below to participate'}
            </p>

            <div className={styles.surveyInput}>
              <input
                type="text"
                placeholder={t('pasteSurveyLink') || 'Paste survey link or ID...'}
                value={surveyLink}
                onChange={(e) => {
                  setSurveyLink(e.target.value);
                  setLinkError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSurveyLink()}
                className={styles.input}
              />
              <button onClick={handleSurveyLink} className={styles.goButton}>
                {t('go') || 'Go'}
              </button>
            </div>
            {linkError && <p className={styles.inputError}>{linkError}</p>}
          </div>

          {/* Admin Path */}
          <div className={styles.pathCard}>
            <div className={styles.pathIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
                <path d="M8 18h.01" />
                <path d="M12 18h.01" />
              </svg>
            </div>
            <h2 className={styles.pathTitle}>
              {t('forAdministrators') || 'For Administrators'}
            </h2>
            <p className={styles.pathDescription}>
              {t('adminDescription') || 'Create and manage multi-question surveys'}
            </p>

            {isLoading ? (
              <div className={styles.loadingButton}>
                <div className={styles.spinner} />
              </div>
            ) : isAuthenticated ? (
              <Link href="/admin/surveys" className={styles.primaryButton}>
                {t('goToDashboard') || 'Go to Dashboard'}
              </Link>
            ) : (
              <Link href="/login" className={styles.primaryButton}>
                {t('signInWithGoogle') || 'Sign in with Google'}
              </Link>
            )}

            {isAuthenticated && user && (
              <p className={styles.userInfo}>
                {t('signedInAs') || 'Signed in as'} {user.displayName || user.email}
              </p>
            )}
          </div>
        </div>

        {/* How it Works */}
        <section className={styles.howItWorks}>
          <h3>{t('howItWorks') || 'How It Works'}</h3>
          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <span className={styles.stepText}>
                {t('step1') || 'Read questions and explore solutions'}
              </span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <span className={styles.stepText}>
                {t('step2') || 'Rate solutions from disagree to agree'}
              </span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <span className={styles.stepText}>
                {t('step3') || 'Submit your own ideas'}
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Powered by Freedi</p>
      </footer>
    </div>
  );
}

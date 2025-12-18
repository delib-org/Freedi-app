'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import styles from './LandingPage.module.scss';

interface LandingPageProps {
  onGetStarted: () => void;
}

/**
 * Landing page for Mass Consensus - explains the concept and provides login
 */
export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const { t } = useTranslation();
  const { signIn, isLoading } = useAuth();

  const handleSignIn = async () => {
    try {
      await signIn();
      onGetStarted();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  return (
    <div className={styles.landing}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroAnimation}>
            <div className={styles.consensusVisual}>
              <div className={styles.dot} style={{ '--delay': '0s', '--color': 'var(--disagree)' } as React.CSSProperties} />
              <div className={styles.dot} style={{ '--delay': '0.2s', '--color': 'var(--option)' } as React.CSSProperties} />
              <div className={styles.dot} style={{ '--delay': '0.4s', '--color': 'var(--agree)' } as React.CSSProperties} />
              <div className={styles.dot} style={{ '--delay': '0.6s', '--color': 'var(--btn-primary)' } as React.CSSProperties} />
              <div className={styles.dot} style={{ '--delay': '0.8s', '--color': 'var(--question)' } as React.CSSProperties} />
            </div>
          </div>
          <h1 className={styles.heroTitle}>
            {t('landingHeroTitle') || 'Beyond Winners and Losers'}
          </h1>
          <p className={styles.heroSubtitle}>
            {t('landingHeroSubtitle') || "Build real consensus, not 51% majorities. Everyone's voice shapes the solution."}
          </p>
          <div className={styles.heroCta}>
            <button
              className={styles.primaryButton}
              onClick={handleSignIn}
              disabled={isLoading}
            >
              {isLoading
                ? (t('signingIn') || 'Signing in...')
                : (t('landingGetStarted') || 'Get Started')}
            </button>
            <a href="#how-it-works" className={styles.secondaryLink}>
              {t('landingSeeHow') || 'See How It Works'}
            </a>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className={styles.problem}>
        <h2 className={styles.sectionTitle}>
          {t('landingProblemTitle') || 'The Problem With Voting'}
        </h2>
        <div className={styles.problemGrid}>
          <div className={styles.problemCard}>
            <div className={styles.problemIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v18M3 12h18M8 8l8 8M16 8l-8 8" />
              </svg>
            </div>
            <h3>{t('landingProblem1Title') || '51% vs 49%'}</h3>
            <p>{t('landingProblem1Text') || 'Someone always loses. Half the population left unhappy.'}</p>
          </div>
          <div className={styles.problemCard}>
            <div className={styles.problemIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>{t('landingProblem2Title') || 'Fixed Options'}</h3>
            <p>{t('landingProblem2Text') || 'Someone else decides what you can choose between.'}</p>
          </div>
          <div className={styles.problemCard}>
            <div className={styles.problemIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3l4 4-4 4M7 21l-4-4 4-4M3 7h18M3 17h18" />
              </svg>
            </div>
            <h3>{t('landingProblem3Title') || 'Division Rewarded'}</h3>
            <p>{t('landingProblem3Text') || "Polarization wins votes. Unity doesn't get attention."}</p>
          </div>
        </div>
        <p className={styles.problemSummary}>
          {t('landingProblemSummary') || 'Traditional voting creates winners and losers. We can do better.'}
        </p>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>
          {t('landingHowTitle') || 'How Mass Consensus Works'}
        </h2>
        <div className={styles.stepsContainer}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <div className={styles.stepVisual}>
                <div className={styles.ratingScale}>
                  <span className={styles.scaleNeg}>-1</span>
                  <div className={styles.scaleBar}>
                    <div className={styles.scaleThumb} />
                  </div>
                  <span className={styles.scalePos}>+1</span>
                </div>
              </div>
              <h3>{t('landingStep1Title') || 'Rate Ideas'}</h3>
              <p>{t('landingStep1Text') || 'Rate proposals on a spectrum from -1 (strongly disagree) to +1 (strongly agree). Your nuanced opinion matters.'}</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <div className={styles.stepVisual}>
                <div className={styles.submitIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v18M5 10l7-7 7 7" />
                  </svg>
                </div>
              </div>
              <h3>{t('landingStep2Title') || 'Submit Your Own'}</h3>
              <p>{t('landingStep2Text') || 'Anyone can propose solutions. The best ideas rise based on collective consensus.'}</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <div className={styles.stepVisual}>
                <div className={styles.consensusBars}>
                  <div className={styles.bar} style={{ '--height': '40%' } as React.CSSProperties} />
                  <div className={styles.bar} style={{ '--height': '70%' } as React.CSSProperties} />
                  <div className={styles.bar} style={{ '--height': '90%' } as React.CSSProperties} />
                  <div className={styles.bar} style={{ '--height': '60%' } as React.CSSProperties} />
                </div>
              </div>
              <h3>{t('landingStep3Title') || 'Watch Consensus Emerge'}</h3>
              <p>{t('landingStep3Text') || 'Real-time results show which ideas bring people together, not apart.'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className={styles.benefits}>
        <h2 className={styles.sectionTitle}>
          {t('landingBenefitsTitle') || 'Why Mass Consensus?'}
        </h2>
        <div className={styles.benefitsGrid}>
          <div className={styles.benefitCard}>
            <div className={styles.benefitIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3>{t('landingBenefit1Title') || 'Protects Minorities'}</h3>
            <p>{t('landingBenefit1Text') || 'Consensus means solutions work for everyone, not just the majority.'}</p>
          </div>
          <div className={styles.benefitCard}>
            <div className={styles.benefitIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.781 0-4.781 8 0 8 5.606 0 7.644-8 12.74-8z" />
              </svg>
            </div>
            <h3>{t('landingBenefit2Title') || 'Unlimited Ideas'}</h3>
            <p>{t('landingBenefit2Text') || 'No fixed options. Anyone can propose and refine ideas until we find what works.'}</p>
          </div>
          <div className={styles.benefitCard}>
            <div className={styles.benefitIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l8.42 8.42 8.42-8.42a5.4 5.4 0 0 0 0-7.65z" />
              </svg>
            </div>
            <h3>{t('landingBenefit3Title') || 'Incentivizes Unity'}</h3>
            <p>{t('landingBenefit3Text') || 'The winning idea is the one that brings people together, not divides them.'}</p>
          </div>
          <div className={styles.benefitCard}>
            <div className={styles.benefitIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3>{t('landingBenefit4Title') || 'Real-Time Results'}</h3>
            <p>{t('landingBenefit4Text') || 'Watch as consensus emerges. See how your input shapes the outcome.'}</p>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className={styles.quote}>
        <div className={styles.quoteContent}>
          <div className={styles.quoteMark}>&ldquo;</div>
          <blockquote>
            {t('landingQuote') || "We don't choose between existing options - we create better ones together."}
          </blockquote>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className={styles.finalCta}>
        <h2>{t('landingCtaTitle') || 'Ready to Build Consensus?'}</h2>
        <p className={styles.ctaSubtitle}>
          {t('landingCtaSubtitle') || 'Join thousands of people creating solutions together'}
        </p>
        <button
          className={styles.googleButton}
          onClick={handleSignIn}
          disabled={isLoading}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>
            {isLoading
              ? (t('signingIn') || 'Signing in...')
              : (t('signInWithGoogle') || 'Sign in with Google')}
          </span>
        </button>
        <p className={styles.terms}>
          {t('landingTerms') || 'By signing in, you agree to our Terms of Service'}
        </p>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>Mass Consensus</div>
          <p className={styles.footerPowered}>
            {t('landingPoweredBy') || 'Powered by Freedi'}
          </p>
          <p className={styles.footerInstitute}>
            {t('landingInstitute') || 'From the Institute for Deliberative Democracy'}
          </p>
        </div>
      </footer>
    </div>
  );
}

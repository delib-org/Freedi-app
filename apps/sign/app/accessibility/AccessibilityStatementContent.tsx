'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './page.module.scss';

export default function AccessibilityStatementContent() {
  const { t } = useTranslation();

  // Get current date formatted
  const lastUpdated = new Date().toLocaleDateString('en-IL', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('Accessibility Statement')}</h1>
        <p className={styles.subtitle}>{t('Our commitment to accessibility')}</p>
      </header>

      <main className={styles.content}>
        {/* Commitment Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Our Commitment')}</h2>
          <p>
            {t('WizCol-Sign is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.')}
          </p>
        </section>

        {/* Compliance Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Compliance Status')}</h2>
          <p>
            {t('We strive to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standards and the Israeli Standard IS 5568 for web accessibility.')}
          </p>
          <div className={styles.complianceBadge}>
            <span className={styles.badgeLabel}>WCAG 2.1</span>
            <span className={styles.badgeLevel}>Level AA</span>
          </div>
        </section>

        {/* Measures Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Accessibility Measures')}</h2>
          <p>{t('We have taken the following measures to ensure accessibility:')}</p>
          <ul className={styles.measuresList}>
            <li>{t('Keyboard navigation support for all interactive elements')}</li>
            <li>{t('Text resizing options (4 levels: normal, large, larger, largest)')}</li>
            <li>{t('High contrast mode (light and dark options)')}</li>
            <li>{t('Option to stop animations and reduce motion')}</li>
            <li>{t('Alternative text for images')}</li>
            <li>{t('Clear heading structure for screen readers')}</li>
            <li>{t('Focus indicators for keyboard navigation')}</li>
            <li>{t('Semantic HTML structure')}</li>
            <li>{t('ARIA labels for interactive components')}</li>
            <li>{t('Sufficient color contrast ratios')}</li>
          </ul>
        </section>

        {/* Accessibility Features Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Accessibility Features')}</h2>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7V4h16v3" />
                  <path d="M9 20h6" />
                  <path d="M12 4v16" />
                </svg>
              </div>
              <h3>{t('Text Size')}</h3>
              <p>{t('Adjust text size to your preference with 4 available levels')}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              <h3>{t('High Contrast')}</h3>
              <p>{t('Switch between default, high contrast light, and high contrast dark modes')}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                  <path d="M6 8h.001" />
                  <path d="M10 8h.001" />
                  <path d="M14 8h.001" />
                  <path d="M18 8h.001" />
                  <path d="M8 12h.001" />
                  <path d="M12 12h.001" />
                  <path d="M16 12h.001" />
                  <path d="M7 16h10" />
                </svg>
              </div>
              <h3>{t('Keyboard Navigation')}</h3>
              <p>{t('Full keyboard navigation support for all features')}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                </svg>
              </div>
              <h3>{t('Stop Animations')}</h3>
              <p>{t('Disable all animations and motion effects')}</p>
            </div>
          </div>
        </section>

        {/* Known Limitations Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Known Limitations')}</h2>
          <p>
            {t('While we strive for full accessibility, some third-party content or features may have limitations. We are working to address these issues.')}
          </p>
        </section>

        {/* Contact Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('Report an Issue')}</h2>
          <p>
            {t('We welcome your feedback on the accessibility of WizCol-Sign. Please let us know if you encounter any accessibility barriers:')}
          </p>
          <div className={styles.contactInfo}>
            <p>
              <strong>{t('Email')}:</strong>{' '}
              <a href="mailto:accessibility@wizcol.com">accessibility@wizcol.com</a>
            </p>
          </div>
          <p className={styles.responseTime}>
            {t('We aim to respond to accessibility feedback within 5 business days.')}
          </p>
        </section>

        {/* Last Updated */}
        <footer className={styles.footer}>
          <p>
            <strong>{t('Last Updated')}:</strong> {lastUpdated}
          </p>
        </footer>
      </main>

      {/* Back to Home Link */}
      <div className={styles.backLink}>
        <a href="/">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          {t('Back to Home')}
        </a>
      </div>
    </div>
  );
}

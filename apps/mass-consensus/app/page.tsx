import { Metadata } from 'next';
import styles from './page.module.scss';

export const metadata: Metadata = {
  title: 'Freedi Mass Consensus - Fast Crowdsourced Solutions',
  description: 'Join our vibrant community in building consensus and evaluating solutions together!',
};

/**
 * Stunning welcome page with delightful animations
 */
export default function HomePage() {
  return (
    <div className={styles.container}>
      {/* Floating Background Emojis */}
      <div className={styles.floatingEmojis}>
        <span className={styles.emoji}>🌟</span>
        <span className={styles.emoji}>💡</span>
        <span className={styles.emoji}>🎯</span>
        <span className={styles.emoji}>✨</span>
        <span className={styles.emoji}>🚀</span>
      </div>

      {/* Hero Section */}
      <div className={styles.hero}>
        <h1 className={styles.title}>
          <span>Welcome to</span>{' '}
          <span className="text-gradient">Freedi</span>{' '}
          <span>Mass Consensus</span>
        </h1>

        <p className={styles.subtitle}>
          Join thousands in shaping decisions together!
          A delightful platform where your voice matters and every evaluation counts.
          Let's build consensus with joy! 🎉
        </p>

        {/* Feature Cards */}
        <div className={styles.features}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🤝</div>
            <h3 className={styles.featureTitle}>Collaborate</h3>
            <p className={styles.featureDescription}>
              Work together with a vibrant community
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚡</div>
            <h3 className={styles.featureTitle}>Fast & Fun</h3>
            <p className={styles.featureDescription}>
              Quick evaluations with delightful interactions
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🏆</div>
            <h3 className={styles.featureTitle}>Achieve</h3>
            <p className={styles.featureDescription}>
              Earn badges and track your impact
            </p>
          </div>
        </div>
      </div>

      {/* How it Works Section */}
      <div className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepText}>
              📖 Read the question and explore creative solutions from the community
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepText}>
              ⭐ Evaluate solutions with our delightful rating system (-1 to +1)
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepText}>
              🔄 Get fresh batches of solutions to keep the momentum going
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepText}>
              💡 Submit your own brilliant solution and watch it gain consensus
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepText}>
              📊 View beautiful visualizations and get AI-powered insights
            </span>
          </li>
        </ol>
      </div>

      {/* Getting Started Card */}
      <div className={styles.gettingStarted}>
        <h3>Ready to Make an Impact?</h3>
        <p>Jump into any question and start building consensus with the community!</p>
        <div className={styles.urlExample}>
          /q/[statementId]
        </div>

        <a href="/q/example" className={styles.ctaButton}>
          <span className={styles.ctaText}>Start Contributing</span>
          <span className={styles.ctaIcon}>→</span>
        </a>
      </div>
    </div>
  );
}
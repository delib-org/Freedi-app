import Link from 'next/link';
import styles from './q-results.module.scss';

export default function NotFound() {
  return (
    <div className={styles.resultsPage}>
      <header className={styles.resultsPage__header}>
        <h1 className={styles.resultsPage__title}>Results Not Found</h1>
      </header>

      <main className={styles.resultsPage__content}>
        <div className={styles.resultsPage__emptyState}>
          <div>
            <p>The question you&apos;re looking for doesn&apos;t exist or has been removed.</p>
            <p style={{ marginTop: '1rem' }}>
              <Link href="/" style={{ color: 'var(--btn-primary)', textDecoration: 'underline' }}>
                Go back home
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

import styles from './q-results.module.scss';

export default function Loading() {
  return (
    <div className={styles.resultsPage}>
      <header className={styles.resultsPage__header}>
        <div className={styles.skeletonTitle} style={{ width: '150px', margin: '0 auto' }} />
        <div className={styles.skeletonText} style={{ width: '100px', margin: '1rem auto 0' }} />
      </header>

      <div className={styles.resultsPage__question}>
        <div className={styles.skeletonText} style={{ width: '80%', margin: '0 auto' }} />
      </div>

      <main className={styles.resultsPage__content}>
        <div className={styles.resultsList}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonText} />
              <div className={styles.skeletonText} />
              <div className={styles.skeletonMetrics}>
                <div className={styles.skeletonBadge} />
                <div className={styles.skeletonBadge} />
                <div className={styles.skeletonBadge} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

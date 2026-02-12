import styles from '@/components/my-suggestions/MySuggestionsPage.module.scss';

export default function Loading() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.skeleton} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
        <div className={styles.skeleton} style={{ width: '180px', height: '28px' }} />
      </header>

      <div className={styles.summaryBanner}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.statItem}>
            <div className={styles.skeleton} style={{ width: '48px', height: '32px' }} />
            <div className={styles.skeleton} style={{ width: '80px', height: '14px' }} />
          </div>
        ))}
      </div>

      {[1, 2].map((section) => (
        <div key={section} style={{ marginBottom: '1.5rem' }}>
          <div className={styles.skeleton} style={{ width: '70%', height: '24px', marginBottom: '1rem' }} />
          {[1, 2].map((card) => (
            <div key={card} style={{ marginBottom: '1rem' }}>
              <div className={styles.skeleton} style={{ width: '100%', height: '160px', borderRadius: '12px' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

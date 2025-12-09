import styles from './loading.module.scss';

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={`skeleton ${styles.titleSkeleton}`} />
        <div className={`skeleton ${styles.subtitleSkeleton}`} />
      </div>

      <div className={styles.content}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.paragraphSkeleton}>
            <div className={`skeleton ${styles.textSkeleton}`} />
            <div className={`skeleton ${styles.textSkeleton}`} style={{ width: '80%' }} />
            <div className={`skeleton ${styles.textSkeleton}`} style={{ width: '60%' }} />
            <div className={styles.actionsSkeleton}>
              <div className={`skeleton ${styles.buttonSkeleton}`} />
              <div className={`skeleton ${styles.buttonSkeleton}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

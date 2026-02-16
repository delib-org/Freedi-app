'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useRealtimeSignatureCounts } from '@/hooks/useRealtimeSignatureCounts';
import styles from './SignatureStats.module.scss';

interface SignatureStatsProps {
  documentId: string;
}

export default function SignatureStats({ documentId }: SignatureStatsProps) {
  const { t } = useTranslation();
  const { signedCount, rejectedCount, isLoading } = useRealtimeSignatureCounts(documentId);

  const prevSignedRef = useRef(signedCount);
  const prevRejectedRef = useRef(rejectedCount);
  const signedSpanRef = useRef<HTMLSpanElement>(null);
  const rejectedSpanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prevSignedRef.current !== signedCount && signedSpanRef.current) {
      signedSpanRef.current.classList.remove(styles.countPulse);
      // Force reflow to restart animation
      void signedSpanRef.current.offsetWidth;
      signedSpanRef.current.classList.add(styles.countPulse);
    }
    prevSignedRef.current = signedCount;
  }, [signedCount]);

  useEffect(() => {
    if (prevRejectedRef.current !== rejectedCount && rejectedSpanRef.current) {
      rejectedSpanRef.current.classList.remove(styles.countPulse);
      void rejectedSpanRef.current.offsetWidth;
      rejectedSpanRef.current.classList.add(styles.countPulse);
    }
    prevRejectedRef.current = rejectedCount;
  }, [rejectedCount]);

  if (isLoading || (signedCount === 0 && rejectedCount === 0)) {
    return null;
  }

  const formatter = new Intl.NumberFormat();

  return (
    <div className={styles.statsBar} role="status" aria-live="polite">
      {signedCount > 0 && (
        <div className={styles.stat}>
          <span className={`${styles.icon} ${styles.signedIcon}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span ref={signedSpanRef} className={styles.count}>
            {formatter.format(signedCount)}
          </span>
          {t('signed')}
        </div>
      )}
      {rejectedCount > 0 && (
        <div className={styles.stat}>
          <span className={`${styles.icon} ${styles.rejectedIcon}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
          <span ref={rejectedSpanRef} className={styles.count}>
            {formatter.format(rejectedCount)}
          </span>
          {t('rejected')}
        </div>
      )}
    </div>
  );
}

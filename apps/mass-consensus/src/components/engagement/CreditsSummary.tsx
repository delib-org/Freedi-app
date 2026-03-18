'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './CreditsSummary.module.scss';

interface CreditsSummaryProps {
  credits: number;
}

export default function CreditsSummary({ credits }: CreditsSummaryProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.creditsSummary}>
      <span className={styles.amount}>{credits}</span>
      <span className={styles.label}>{t('Credits earned')}</span>
    </div>
  );
}

'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME } from '@/types';
import styles from './PrivateDocumentNotice.module.scss';

interface PrivateDocumentNoticeProps {
  logoUrl?: string;
  brandName?: string;
}

export default function PrivateDocumentNotice({
  logoUrl = DEFAULT_LOGO_URL,
  brandName = DEFAULT_BRAND_NAME,
}: PrivateDocumentNoticeProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <h1 className={styles.title}>{t('This document is private')}</h1>
      <p className={styles.description}>
        {t('This document is not available for public viewing. Please contact the document owner for access.')}
      </p>
      <a href="/" className={styles.homeLink}>
        {t('Go to Home')}
      </a>
      <div className={styles.branding}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={brandName} className={styles.logo} />
      </div>
    </div>
  );
}

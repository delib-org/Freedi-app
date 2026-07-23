'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME } from '@/types';
import LoginModal from '../shared/LoginModal';
import Modal from '../shared/Modal';
import styles from './PrivateDocumentNotice.module.scss';

interface PrivateDocumentNoticeProps {
  logoUrl?: string;
  brandName?: string;
  /** When true, show a login prompt instead of access denied */
  showLoginPrompt?: boolean;
  /** 'private' = access restricted, 'hidden' = admin has hidden the document */
  variant?: 'private' | 'hidden';
}

export default function PrivateDocumentNotice({
  logoUrl = DEFAULT_LOGO_URL,
  brandName = DEFAULT_BRAND_NAME,
  showLoginPrompt = false,
  variant = 'private',
}: PrivateDocumentNoticeProps) {
  const { t } = useTranslation();

  const title = variant === 'hidden'
    ? t('This document is temporarily unavailable')
    : t('This document is private');
  const description = variant === 'hidden'
    ? t('The document owner has hidden this document. Please check back later or contact the document owner.')
    : showLoginPrompt
      ? t('Please sign in with Google to access this document.')
      : t('This document is not available for public viewing. Please contact the document owner for access.');

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
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>

      {showLoginPrompt && variant !== 'hidden' ? (
        <div className={styles.loginWrapper}>
          <Modal title={t('Sign In Required')} onClose={() => { /* non-dismissible */ }}>
            <LoginModal onClose={() => { /* non-dismissible */ }} hideGuestOption />
          </Modal>
        </div>
      ) : (
        <a href="/" className={styles.homeLink}>
          {t('Go to Home')}
        </a>
      )}

      <div className={styles.branding}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={brandName} className={styles.logo} />
      </div>
    </div>
  );
}

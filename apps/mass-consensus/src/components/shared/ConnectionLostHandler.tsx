'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './ConnectionLostHandler.module.css';

/**
 * Global handler for IndexedDB connection lost errors
 *
 * This error commonly occurs in Facebook's in-app browser (iOS WebView)
 * when the app is backgrounded for extended periods and iOS reclaims memory.
 *
 * Shows a user-friendly prompt to refresh the page.
 */
export default function ConnectionLostHandler() {
  const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = event.reason?.message || String(event.reason);

      // Check for IndexedDB connection lost error
      if (
        errorMessage.includes('Connection to Indexed Database server lost') ||
        errorMessage.includes('IndexedDB') && errorMessage.includes('lost')
      ) {
        // Prevent the error from appearing in console
        event.preventDefault();
        setShowRefreshPrompt(true);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!showRefreshPrompt) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </div>
        <h2 className={styles.title}>{t('Connection Lost')}</h2>
        <p className={styles.message}>
          {t('The connection was interrupted. Please refresh the page to continue.')}
        </p>
        <button className={styles.refreshButton} onClick={handleRefresh}>
          {t('Refresh Page')}
        </button>
      </div>
    </div>
  );
}

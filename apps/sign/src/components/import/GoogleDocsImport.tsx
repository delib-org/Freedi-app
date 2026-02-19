'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError } from '@/lib/utils/errorHandling';
import styles from './GoogleDocsImport.module.scss';

interface GoogleDocsImportProps {
  statementId: string;
  onImportComplete?: () => void;
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

export default function GoogleDocsImport({
  statementId,
  onImportComplete,
}: GoogleDocsImportProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');

  const handleImport = async () => {
    if (!url.trim()) {
      setErrorMessage(t('Please enter a Google Docs URL'));
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/import/google-docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentUrl: url,
          statementId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setUrl('');
        onImportComplete?.();

        // Reset success status after 3 seconds
        setTimeout(() => {
          setStatus('idle');
        }, 3000);
      } else {
        setStatus('error');
        setErrorMessage(data.error || t('Failed to import document'));
        if (data.serviceAccountEmail) {
          setServiceAccountEmail(data.serviceAccountEmail);
        }
      }
    } catch (error) {
      logError(error, {
        operation: 'GoogleDocsImport.handleImport',
        metadata: { statementId },
      });
      setStatus('error');
      setErrorMessage(t('Failed to import document. Please try again.'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && status !== 'loading') {
      handleImport();
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        {t('Paste a Google Docs link to import content')}
      </p>

      <div className={styles.inputGroup}>
        <input
          type="url"
          className={styles.input}
          placeholder={t('Enter Google Docs URL')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={status === 'loading'}
        />
        <button
          className={styles.importButton}
          onClick={handleImport}
          disabled={status === 'loading' || !url.trim()}
        >
          {status === 'loading' ? t('Importing...') : t('Import')}
        </button>
      </div>

      {status === 'error' && errorMessage && (
        <div className={styles.error}>
          <p>{errorMessage}</p>
          {serviceAccountEmail && (
            <p className={styles.shareHint}>
              {t('Share your document with:')} <code>{serviceAccountEmail}</code>
            </p>
          )}
        </div>
      )}

      {status === 'success' && (
        <div className={styles.success}>
          {t('Document imported successfully')}
        </div>
      )}

      <div className={styles.shareInfo}>
        <p className={styles.shareLabel}>{t('To enable importing, share your document with:')}</p>
        <code className={styles.shareEmail}>
          {process.env.NEXT_PUBLIC_GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL}
        </code>
      </div>
    </div>
  );
}

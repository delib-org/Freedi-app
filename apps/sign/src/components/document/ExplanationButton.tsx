'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import ExplanationVideoModal from './ExplanationVideoModal';
import styles from './ExplanationButton.module.scss';

interface ExplanationButtonProps {
  videoUrl: string;
}

export default function ExplanationButton({ videoUrl }: ExplanationButtonProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  // Don't render if no video URL
  if (!videoUrl) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={styles.explanationButton}
        onClick={() => setShowModal(true)}
        aria-label={t('Explanation')}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
        </svg>
        <span>{t('Explanation')}</span>
      </button>

      {showModal && (
        <ExplanationVideoModal
          videoUrl={videoUrl}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

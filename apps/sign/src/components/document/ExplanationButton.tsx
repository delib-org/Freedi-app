'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import ExplanationVideoModal from './ExplanationVideoModal';
import styles from './ExplanationButton.module.scss';

interface ExplanationButtonProps {
  videoUrl: string;
  documentId: string;
}

/**
 * Floating button for optional video mode
 * Users click to watch the explanation video
 */
export default function ExplanationButton({
  videoUrl,
  documentId,
}: ExplanationButtonProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  // Suppress unused variable warning - documentId kept for future use (analytics, etc.)
  void documentId;

  // Don't render if no video URL
  if (!videoUrl) {
    return null;
  }

  return (
    <>
      {/* Floating explanation video button */}
      <button
        type="button"
        className={styles.floatingButton}
        onClick={handleOpenModal}
        aria-label={t('Watch video guide')}
        title={t('Click to watch explanation video')}
      >
        <span className={styles.iconWrapper}>
          {/* Video player/TV icon - clearer than generic play button */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* TV/Monitor frame */}
            <rect
              x="2"
              y="3"
              width="20"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            {/* Play triangle inside */}
            <polygon
              points="10 7 10 13 15 10"
              fill="currentColor"
            />
            {/* TV stand */}
            <line
              x1="8"
              y1="21"
              x2="16"
              y2="21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="12"
              y1="17"
              x2="12"
              y2="21"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </span>
        <span className={styles.buttonText}>
          {t('Watch Video Guide')}
        </span>
      </button>

      {showModal && (
        <ExplanationVideoModal
          videoUrl={videoUrl}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}

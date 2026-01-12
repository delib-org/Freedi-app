'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import ExplanationVideoModal from './ExplanationVideoModal';
import styles from './ExplanationButton.module.scss';

interface ExplanationButtonProps {
  videoUrl: string;
  documentId: string;
  /** Delay in ms before auto-showing the video (default: 2000) */
  autoShowDelay?: number;
}

const STORAGE_KEY_PREFIX = 'explanation_video_seen_';

export default function ExplanationButton({
  videoUrl,
  documentId,
  autoShowDelay = 2000
}: ExplanationButtonProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [hasAutoShown, setHasAutoShown] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // Check if user has already seen the auto-popup for this document
  const getStorageKey = useCallback(() => {
    return `${STORAGE_KEY_PREFIX}${documentId}`;
  }, [documentId]);

  const hasSeenVideo = useCallback(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(getStorageKey()) === 'true';
  }, [getStorageKey]);

  const markVideoAsSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(getStorageKey(), 'true');
    }
  }, [getStorageKey]);

  // Check first visit status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsFirstVisit(!hasSeenVideo());
    }
  }, [hasSeenVideo]);

  // Auto-show video modal after delay (only once per session)
  useEffect(() => {
    if (!videoUrl || hasAutoShown || hasSeenVideo()) {
      return;
    }

    const timer = setTimeout(() => {
      setShowModal(true);
      setHasAutoShown(true);
      markVideoAsSeen();
      setIsFirstVisit(false);
    }, autoShowDelay);

    return () => clearTimeout(timer);
  }, [videoUrl, autoShowDelay, hasAutoShown, hasSeenVideo, markVideoAsSeen]);

  const handleOpenModal = () => {
    setShowModal(true);
    markVideoAsSeen();
    setIsFirstVisit(false);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

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
        {/* "New" badge for first-time visitors */}
        {isFirstVisit && (
          <span className={styles.newBadge}>
            {t('new') || 'NEW'}
          </span>
        )}

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

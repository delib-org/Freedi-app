'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './ExplanationVideoOverlay.module.scss';

interface ExplanationVideoOverlayProps {
  videoUrl: string;
  documentId: string;
  onDismiss: () => void;
}

const STORAGE_KEY_PREFIX = 'explanation_video_dismissed_';

/**
 * Extract YouTube video ID and return embed URL with autoplay
 */
function getYouTubeEmbedUrl(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
    }
  }
  return '';
}

/**
 * Full-screen blocking overlay that shows explanation video
 * User must dismiss before viewing the document
 */
export default function ExplanationVideoOverlay({
  videoUrl,
  documentId,
  onDismiss,
}: ExplanationVideoOverlayProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(true);

  // Check if user has already dismissed for this document (this session)
  const getStorageKey = useCallback(() => {
    return `${STORAGE_KEY_PREFIX}${documentId}`;
  }, [documentId]);

  const hasDismissed = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(getStorageKey()) === 'true';
  }, [getStorageKey]);

  const markAsDismissed = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(getStorageKey(), 'true');
    }
  }, [getStorageKey]);

  // Check on mount if already dismissed
  useEffect(() => {
    if (hasDismissed()) {
      setIsVisible(false);
      onDismiss();
    }
  }, [hasDismissed, onDismiss]);

  const handleDismiss = useCallback(() => {
    markAsDismissed();
    setIsVisible(false);
    onDismiss();
  }, [markAsDismissed, onDismiss]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when overlay is visible
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isVisible, handleDismiss]);

  if (!isVisible || !videoUrl) {
    return null;
  }

  const embedUrl = getYouTubeEmbedUrl(videoUrl);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('Explanation Video')}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <polygon points="10 7 10 13 15 10" fill="currentColor" stroke="none" />
              <line x1="8" y1="21" x2="16" y2="21" strokeLinecap="round" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            {t('Watch Video Before Continuing')}
          </h2>
          <p className={styles.subtitle}>
            {t('Please watch this short explanation video before viewing the document')}
          </p>
        </div>

        <div className={styles.videoContainer}>
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={t('Explanation Video')}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className={styles.video}
            />
          ) : (
            <div className={styles.videoError}>
              <p>{t('Invalid video URL')}</p>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={handleDismiss}
          >
            {t('Continue to Document')}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

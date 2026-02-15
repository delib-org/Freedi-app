'use client';

import { useState, useEffect, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import { useTranslation } from '@freedi/shared-i18n/next';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './SwipeCard.module.css';

interface SwipeCardProps {
  solution: Statement;
  onRate: (solutionId: string, score: number, direction: 'left' | 'right') => void;
  isTop: boolean;
  throwDirection: 'left' | 'right' | null;
  onThrowComplete: () => void;
  totalVotes?: number;
  approvalRate?: number;
}

/**
 * Tinder-style swipe card component
 * Supports drag gestures and throw animations
 */
export default function SwipeCard({
  solution,
  onRate,
  isTop,
  throwDirection,
  onThrowComplete,
  totalVotes = 0,
  approvalRate = 0,
}: SwipeCardProps) {
  const { t } = useTranslation();
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [isEntering, setIsEntering] = useState(isTop);
  const cardRef = useRef<HTMLDivElement>(null);

  const title = solution.statement;
  const description = getParagraphsText(solution.paragraphs) || solution.statement;
  const showDescription = description && description !== title;

  useEffect(() => {
    if (isTop) {
      setIsEntering(true);
      const timer = setTimeout(() => setIsEntering(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isTop]);

  const handleStart = (clientX: number) => {
    if (throwDirection) return;
    setIsDragging(true);
    setStartX(clientX);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || throwDirection) return;
    const diff = clientX - startX;
    setDragX(diff);
  };

  const handleEnd = () => {
    if (throwDirection) return;
    setIsDragging(false);
    if (Math.abs(dragX) > 100) {
      if (dragX > 0) {
        // Swipe right = like (score 0.5)
        onRate(solution.statementId, 0.5, 'right');
      } else {
        // Swipe left = dislike (score -0.5)
        onRate(solution.statementId, -0.5, 'left');
      }
    }
    setDragX(0);
  };

  // Determine animation class
  let animationClass = '';
  if (throwDirection === 'right') {
    animationClass = styles.throwRight;
  } else if (throwDirection === 'left') {
    animationClass = styles.throwLeft;
  } else if (isEntering && isTop) {
    animationClass = styles.cardEnter;
  }

  // Show like/dislike overlay based on drag or throw
  const showLikeOverlay = dragX > 50 || throwDirection === 'right';
  const showDislikeOverlay = dragX < -50 || throwDirection === 'left';

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${isTop && !throwDirection ? styles.isTop : ''} ${animationClass}`}
      style={{
        transform: throwDirection ? undefined : `translateX(${dragX}px) rotate(${dragX * 0.05}deg)`,
        opacity: isTop ? 1 : 0.5,
        scale: isTop && !isEntering ? 1 : (isTop ? undefined : 0.95),
        zIndex: isTop ? 10 : 0,
      }}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
      onAnimationEnd={() => {
        if (throwDirection && onThrowComplete) {
          onThrowComplete();
        }
      }}
    >
      {/* Like Overlay */}
      <div className={`${styles.overlay} ${styles.likeOverlay} ${showLikeOverlay ? styles.visible : ''}`}>
        <div className={styles.overlayStamp}>
          {t('LIKE')} 👍
        </div>
      </div>

      {/* Dislike Overlay */}
      <div className={`${styles.overlay} ${styles.dislikeOverlay} ${showDislikeOverlay ? styles.visible : ''}`}>
        <div className={styles.overlayStampDislike}>
          {t('NOPE')} 👎
        </div>
      </div>

      {/* Card Header */}
      <div className={styles.header}>
        <div className={styles.badge}>
          {t('Proposal')}
        </div>
        {approvalRate > 0 && (
          <div className={styles.approvalBadge}>
            {Math.round(approvalRate)}% {t('approval')}
          </div>
        )}
      </div>

      {/* Proposal Content */}
      <div className={styles.content}>
        <h3 className={styles.title}>
          <InlineMarkdown text={title} />
        </h3>
        {showDescription && (
          <p className={styles.description}>
            <InlineMarkdown text={description} />
          </p>
        )}
      </div>

      {/* Stats */}
      {totalVotes > 0 && (
        <div className={styles.stats}>
          <span className={styles.stat}>
            ❤️ {totalVotes} {t('votes')}
          </span>
        </div>
      )}

      {/* Swipe Hints */}
      <div className={styles.hints}>
        <span className={`${styles.hint} ${dragX < -30 ? styles.hintActive : ''}`}>
          ← {t('Swipe left to dislike')}
        </span>
        <span className={`${styles.hint} ${dragX > 30 ? styles.hintActive : ''}`}>
          {t('Swipe right to like')} →
        </span>
      </div>
    </div>
  );
}

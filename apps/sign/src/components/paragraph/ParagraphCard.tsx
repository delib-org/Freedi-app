'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ParagraphType } from 'delib-npm';
import clsx from 'clsx';
import { Paragraph } from '@/types';
import { useUIStore } from '@/store/uiStore';
import InteractionBar from './InteractionBar';
import styles from './ParagraphCard.module.scss';

interface ParagraphCardProps {
  paragraph: Paragraph;
  documentId: string;
  isApproved: boolean | undefined;
  isLoggedIn: boolean;
  heatLevel?: 'low' | 'medium' | 'high';
  viewCount?: number;
  isAdmin?: boolean;
  commentCount?: number;
}

export default function ParagraphCard({
  paragraph,
  documentId,
  isApproved: initialApproval,
  isLoggedIn,
  heatLevel,
  viewCount,
  isAdmin,
  commentCount: initialCommentCount = 0,
}: ParagraphCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const paragraphType = paragraph.type || ParagraphType.paragraph;

  // Get comment count from store (updates in real-time)
  const storeCommentCount = useUIStore((state) => state.commentCounts[paragraph.paragraphId]);
  // Use store value if available, otherwise fall back to initial prop
  const commentCount = storeCommentCount !== undefined ? storeCommentCount : initialCommentCount;

  // Get approval state from store (updates in real-time when user approves/rejects)
  const storeApproval = useUIStore((state) => state.approvals[paragraph.paragraphId]);

  // Use store value if available, otherwise fall back to initial prop
  const isApproved = storeApproval !== undefined ? storeApproval : initialApproval;

  // Determine approval state for styling
  const approvalState = isApproved === undefined
    ? 'pending'
    : isApproved
      ? 'approved'
      : 'rejected';

  // Handle click outside to collapse on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isExpanded]);

  // Toggle expansion on tap (for mobile)
  const handleTap = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const cardClasses = clsx(
    styles.card,
    styles[`type-${paragraphType}`],
    styles[approvalState],
    heatLevel && styles[`heat-${heatLevel}`],
    isExpanded && styles.expanded
  );

  // Render content based on paragraph type
  const renderContent = () => {
    const content = paragraph.content;

    switch (paragraphType) {
      case ParagraphType.h1:
        return <h1 className={styles.content}>{content}</h1>;
      case ParagraphType.h2:
        return <h2 className={styles.content}>{content}</h2>;
      case ParagraphType.h3:
        return <h3 className={styles.content}>{content}</h3>;
      case ParagraphType.h4:
        return <h4 className={styles.content}>{content}</h4>;
      case ParagraphType.h5:
        return <h5 className={styles.content}>{content}</h5>;
      case ParagraphType.h6:
        return <h6 className={styles.content}>{content}</h6>;
      case ParagraphType.li:
        return (
          <div className={styles.listItem}>
            <span className={styles.bullet}>{paragraph.listType === 'ol' ? '•' : '•'}</span>
            <p className={styles.content}>{content}</p>
          </div>
        );
      default:
        return <p className={styles.content}>{content}</p>;
    }
  };

  return (
    <article
      ref={cardRef}
      id={`paragraph-${paragraph.paragraphId}`}
      className={cardClasses}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
      aria-expanded={isExpanded}
    >
      {/* Visual indicator for approval state */}
      <div className={styles.stateIndicator} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {renderContent()}
      </div>

      <div className={styles.interactionWrapper}>
        <InteractionBar
          paragraphId={paragraph.paragraphId}
          documentId={documentId}
          isApproved={isApproved}
          isLoggedIn={isLoggedIn}
          commentCount={commentCount}
        />
      </div>

      {isAdmin && viewCount !== undefined && (
        <div className={styles.adminInfo}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{viewCount}</span>
        </div>
      )}
    </article>
  );
}

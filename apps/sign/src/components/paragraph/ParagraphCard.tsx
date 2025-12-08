'use client';

import { ParagraphType } from 'delib-npm';
import clsx from 'clsx';
import { Paragraph } from '@/types';
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
}

export default function ParagraphCard({
  paragraph,
  documentId,
  isApproved,
  isLoggedIn,
  heatLevel,
  viewCount,
  isAdmin,
}: ParagraphCardProps) {
  const paragraphType = paragraph.type || ParagraphType.paragraph;

  // Determine approval state
  const approvalState = isApproved === undefined
    ? 'pending'
    : isApproved
      ? 'approved'
      : 'rejected';

  const cardClasses = clsx(
    styles.card,
    styles[`type-${paragraphType}`],
    styles[approvalState],
    heatLevel && styles[`heat-${heatLevel}`]
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
      id={`paragraph-${paragraph.paragraphId}`}
      className={cardClasses}
    >
      {renderContent()}

      <InteractionBar
        paragraphId={paragraph.paragraphId}
        documentId={documentId}
        isApproved={isApproved}
        isLoggedIn={isLoggedIn}
        commentCount={0} // TODO: Add comment count
      />

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

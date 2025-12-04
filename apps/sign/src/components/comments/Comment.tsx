'use client';

import { Statement } from 'delib-npm';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Comment.module.scss';

interface CommentProps {
  comment: Statement;
  onDelete: (commentId: string) => void;
}

export default function Comment({ comment, onDelete }: CommentProps) {
  const { t } = useTranslation();

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('Just now');
    if (diffMins < 60) return `${diffMins} ${t('minutes ago')}`;
    if (diffHours < 24) return `${diffHours} ${t('hours ago')}`;
    if (diffDays < 7) return `${diffDays} ${t('days ago')}`;

    return date.toLocaleDateString();
  };

  // Check if current user owns this comment (simplified - should check against actual user)
  const isOwner = false; // TODO: Compare with current user ID

  const handleDelete = () => {
    if (window.confirm(t('Are you sure you want to delete this comment?'))) {
      onDelete(comment.statementId);
    }
  };

  return (
    <article className={styles.comment}>
      <header className={styles.header}>
        <div className={styles.avatar}>
          {comment.creator?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div className={styles.meta}>
          <span className={styles.author}>
            {comment.creator?.displayName || t('Anonymous')}
          </span>
          <span className={styles.date}>
            {formatDate(comment.createdAt)}
          </span>
        </div>
        {isOwner && (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDelete}
            aria-label={t('Delete comment')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </header>
      <p className={styles.content}>{comment.statement}</p>
    </article>
  );
}

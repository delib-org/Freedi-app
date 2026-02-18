'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import styles from './DocumentCard.module.scss';
import type { HomeDocument } from '@/lib/firebase/homeQueries';

interface DocumentCardProps {
  document: HomeDocument;
}

export default function DocumentCard({ document: doc }: DocumentCardProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleClick = useCallback(() => {
    router.push(`/doc/${doc.statementId}`);
  }, [router, doc.statementId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        router.push(`/doc/${doc.statementId}`);
      }
    },
    [router, doc.statementId]
  );

  const statusBadge = getStatusBadge(doc, t);
  const roleBadge = getRoleBadge(doc.userRole, t);
  const timeAgo = getRelativeTime(doc.lastUpdate);

  return (
    <div
      className={styles.card}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
      aria-label={`${doc.statement} - ${roleBadge}`}
    >
      <div className={styles.topRow}>
        {doc.groupName ? (
          <span className={styles.groupName}>{doc.groupName}</span>
        ) : (
          <span />
        )}
        {statusBadge && (
          <span className={`${styles.statusBadge} ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      <h3 className={styles.title}>{doc.statement}</h3>

      {doc.description && (
        <p className={styles.description}>{doc.description}</p>
      )}

      <div className={styles.bottomRow}>
        <div className={styles.meta}>
          <span className={styles.roleBadge}>{roleBadge}</span>
          {(doc.signedCount > 0 || doc.rejectedCount > 0) && (
            <span className={styles.stats}>
              {doc.signedCount > 0 && `${doc.signedCount} ${t('signed')}`}
              {doc.signedCount > 0 && doc.rejectedCount > 0 && ' / '}
              {doc.rejectedCount > 0 && `${doc.rejectedCount} ${t('rejected')}`}
            </span>
          )}
        </div>
        <span className={styles.timeAgo}>{timeAgo}</span>
      </div>
    </div>
  );
}

function getStatusBadge(
  doc: HomeDocument,
  t: (key: string) => string
): { label: string; className: string } | null {
  if (doc.relationship !== 'signed') return null;

  switch (doc.signatureStatus) {
    case 'signed':
      return { label: t('Signed'), className: styles.signed };
    case 'rejected':
      return { label: t('Rejected'), className: styles.rejected };
    case 'viewed':
      return { label: t('Viewed'), className: styles.viewed };
    default:
      return { label: t('Pending'), className: styles.pending };
  }
}

function getRoleBadge(
  role: HomeDocument['userRole'],
  t: (key: string) => string
): string {
  switch (role) {
    case 'owner':
      return t('Owner');
    case 'admin':
      return t('Admin');
    case 'viewer':
      return t('Viewer');
    case 'signer':
      return t('Signer');
  }
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    if (days > 30) {
      return rtf.format(-Math.floor(days / 30), 'month');
    }
    if (days > 0) {
      return rtf.format(-days, 'day');
    }
    if (hours > 0) {
      return rtf.format(-hours, 'hour');
    }
    if (minutes > 0) {
      return rtf.format(-minutes, 'minute');
    }

    return rtf.format(-seconds, 'second');
  } catch {
    // Fallback for environments where Intl is not available
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;

    return 'just now';
  }
}

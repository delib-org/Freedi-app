'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import Modal from '../shared/Modal';
import CommentThread from '../comments/CommentThread';
import styles from './ParagraphsTable.module.scss';

interface ParagraphStat {
  paragraphId: string;
  statement: string;
  approvalCount: number;
  commentCount: number;
  avgApproval: number;
}

interface ParagraphsTableProps {
  paragraphs: ParagraphStat[];
  documentId: string;
  userId: string | null;
}

export default function ParagraphsTable({
  paragraphs,
  documentId,
  userId,
}: ParagraphsTableProps) {
  const { t } = useTranslation();
  const [selectedParagraph, setSelectedParagraph] = useState<ParagraphStat | null>(null);

  const handleRowClick = (paragraph: ParagraphStat) => {
    if (paragraph.commentCount > 0) {
      setSelectedParagraph(paragraph);
    }
  };

  const closeModal = () => {
    setSelectedParagraph(null);
  };

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('Paragraph')}</th>
            <th>{t('Approvals')}</th>
            <th>{t('Comments')}</th>
            <th>{t('Avg. Rating')}</th>
          </tr>
        </thead>
        <tbody>
          {paragraphs.slice(0, 5).map((paragraph, index) => (
            <tr
              key={paragraph.paragraphId || index}
              className={paragraph.commentCount > 0 ? styles.clickable : ''}
              onClick={() => handleRowClick(paragraph)}
            >
              <td>
                {paragraph.statement?.substring(0, 60)}
                {paragraph.statement && paragraph.statement.length > 60 ? '...' : ''}
              </td>
              <td>{paragraph.approvalCount || 0}</td>
              <td>
                {paragraph.commentCount > 0 ? (
                  <span className={styles.commentLink}>
                    {paragraph.commentCount}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                ) : (
                  0
                )}
              </td>
              <td>{paragraph.avgApproval?.toFixed(2) || '0.00'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Comments Modal */}
      {selectedParagraph && (
        <Modal
          title={`${t('Comments')} - ${selectedParagraph.statement?.substring(0, 40)}${selectedParagraph.statement && selectedParagraph.statement.length > 40 ? '...' : ''}`}
          onClose={closeModal}
          size="large"
        >
          <CommentThread
            paragraphId={selectedParagraph.paragraphId}
            documentId={documentId}
            isLoggedIn={!!userId}
            userId={userId}
          />
        </Modal>
      )}
    </>
  );
}

import { Statement } from 'delib-npm';
import { Signature } from '@/lib/firebase/queries';
import { SignUser } from '@/lib/utils/user';
import DocumentClient from './DocumentClient';
import ParagraphCard from '../paragraph/ParagraphCard';
import SignButton from './SignButton';
import styles from './DocumentView.module.scss';

interface DocumentViewProps {
  document: Statement;
  paragraphs: Statement[];
  user: SignUser | null;
  userSignature: Signature | null;
  userApprovals: Record<string, boolean>;
}

export default function DocumentView({
  document,
  paragraphs,
  user,
  userSignature,
  userApprovals,
}: DocumentViewProps) {
  // Calculate progress - count all reviewed paragraphs (approved OR rejected)
  const totalParagraphs = paragraphs.length;
  const reviewedCount = Object.keys(userApprovals).length;
  const progressPercent = totalParagraphs > 0
    ? Math.round((reviewedCount / totalParagraphs) * 100)
    : 0;

  return (
    <DocumentClient
      documentId={document.statementId}
      user={user}
      userSignature={userSignature}
    >
      <div className={styles.container}>
        {/* Document Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>{document.statement}</h1>
          {document.description && (
            <p className={styles.description}>{document.description}</p>
          )}

          {/* Progress indicator */}
          {user && totalParagraphs > 0 && (
            <div className={styles.progress}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className={styles.progressText}>
                {reviewedCount} / {totalParagraphs} reviewed ({progressPercent}%)
              </span>
            </div>
          )}
        </header>

        {/* Paragraphs */}
        <main className={styles.content}>
          {paragraphs.length === 0 ? (
            <div className={styles.empty}>
              <p>No paragraphs in this document yet.</p>
            </div>
          ) : (
            paragraphs.map((paragraph) => (
              <ParagraphCard
                key={paragraph.statementId}
                paragraph={paragraph}
                isApproved={userApprovals[paragraph.statementId]}
                isLoggedIn={!!user}
              />
            ))
          )}
        </main>

        {/* Sign/Reject buttons at bottom */}
        {paragraphs.length > 0 && (
          <footer className={styles.footer}>
            <div className={styles.signatureStatus}>
              {!user ? (
                <p className={styles.unsignedStatus}>
                  Sign in to review and sign this document
                </p>
              ) : userSignature ? (
                <p className={styles.signedStatus}>
                  {userSignature.signed === 'signed' && 'You have signed this document'}
                  {userSignature.signed === 'rejected' && 'You have rejected this document'}
                  {userSignature.signed === 'viewed' && 'You have viewed this document'}
                </p>
              ) : (
                <p className={styles.unsignedStatus}>
                  Review all paragraphs and sign or reject the document
                </p>
              )}
            </div>

            <div className={styles.signatureActions}>
              {!user ? (
                <a
                  href={`/login?redirect=/doc/${document.statementId}`}
                  className={styles.signButton}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  Sign In to Sign
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    data-action="reject"
                  >
                    Reject Document
                  </button>
                  <SignButton isSigned={userSignature?.signed === 'signed'} />
                </>
              )}
            </div>
          </footer>
        )}
      </div>
    </DocumentClient>
  );
}

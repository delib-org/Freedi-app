import { Signature } from '@/lib/firebase/queries';
import { Paragraph, StatementWithParagraphs } from '@/types';
import { SignUser } from '@/lib/utils/user';
import DocumentClient from './DocumentClient';
import ParagraphCard from '../paragraph/ParagraphCard';
import SignButton from './SignButton';
import ProgressBar from './ProgressBar';
import UserAvatar from '../shared/UserAvatar';
import styles from './DocumentView.module.scss';

interface DocumentViewProps {
  document: StatementWithParagraphs;
  paragraphs: Paragraph[];
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
  // Check if user is admin (creator of the document)
  const isAdmin = user && document.creatorId === user.id;

  return (
    <DocumentClient
      documentId={document.statementId}
      user={user}
      userSignature={userSignature}
    >
      <div className={styles.container}>
        {/* Top Bar with Logo and User Avatar */}
        <div className={styles.topBar}>
          <a href="/" className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Freedi Sign
          </a>
          <UserAvatar
            user={user}
            documentId={document.statementId}
            isAdmin={isAdmin}
          />
        </div>

        {/* Document Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>{document.statement}</h1>
          {document.description && (
            <p className={styles.description}>{document.description}</p>
          )}

          {/* Progress indicator */}
          {user && paragraphs.length > 0 && (
            <ProgressBar
              initialApprovals={userApprovals}
              totalParagraphs={paragraphs.length}
            />
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
                key={paragraph.paragraphId}
                paragraph={paragraph}
                documentId={document.statementId}
                isApproved={userApprovals[paragraph.paragraphId]}
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

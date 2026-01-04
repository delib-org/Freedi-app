'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { Signature } from '@/lib/firebase/queries';
import { Paragraph, StatementWithParagraphs, TextDirection, TocSettings, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME, DEVELOPED_BY_URL } from '@/types';
import { SignUser } from '@/lib/utils/user';
import { resolveTextDirection } from '@/lib/utils/textDirection';
import DocumentClient from './DocumentClient';
import ParagraphCard from '../paragraph/ParagraphCard';
import SignButton from './SignButton';
import RejectButton from './RejectButton';
import ProgressBar from './ProgressBar';
import UserAvatar from '../shared/UserAvatar';
import { TableOfContents, TocMobileMenu, useTocItems } from '../toc';
import styles from './DocumentView.module.scss';

interface DocumentViewProps {
  document: StatementWithParagraphs;
  paragraphs: Paragraph[];
  user: SignUser | null;
  userSignature: Signature | null;
  userApprovals: Record<string, boolean>;
  commentCounts: Record<string, number>;
  userInteractions?: string[];
  textDirection?: TextDirection;
  logoUrl?: string;
  brandName?: string;
  isAdmin?: boolean;
  tocSettings?: TocSettings;
}

export default function DocumentView({
  document,
  paragraphs,
  user,
  userSignature,
  userApprovals,
  commentCounts,
  userInteractions = [],
  textDirection = 'auto',
  logoUrl = DEFAULT_LOGO_URL,
  brandName = DEFAULT_BRAND_NAME,
  isAdmin = false,
  tocSettings,
}: DocumentViewProps) {
  const { t } = useTranslation();

  // Convert array to Set for O(1) lookup
  const userInteractionsSet = new Set(userInteractions);

  // Resolve text direction based on setting and content
  const paragraphContents = paragraphs.map((p) => p.content);
  const resolvedDirection = resolveTextDirection(textDirection, paragraphContents);

  // Extract TOC items from paragraphs
  const tocItems = useTocItems(paragraphs, tocSettings?.tocMaxLevel ?? 2);

  // Determine if TOC should be shown
  const showToc = tocSettings?.tocEnabled && tocItems.length > 0;

  return (
      <DocumentClient
        documentId={document.statementId}
        user={user}
        userSignature={userSignature}
        commentCounts={commentCounts}
        userInteractions={userInteractions}
        isAdmin={isAdmin}
      >
        <div className={styles.container} dir={resolvedDirection} data-text-dir={resolvedDirection}>
        {/* Top Bar with Logo and User Avatar */}
        <div className={styles.topBar}>
          {/* Mobile TOC hamburger menu */}
          {showToc && (
            <TocMobileMenu
              items={tocItems}
              textDirection={resolvedDirection}
            />
          )}
          <a href={`/doc/${document.statementId}`} className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={brandName}
              className={styles.logoImage}
            />
          </a>
          <div className={styles.topBarActions}>
            {isAdmin && (
              <a href={`/doc/${document.statementId}/admin`} className={styles.adminButton}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
                {t('admin') || 'Admin'}
              </a>
            )}
            <UserAvatar
              user={user}
              documentId={document.statementId}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* Desktop Table of Contents sidebar */}
        {showToc && (
          <TableOfContents
            items={tocItems}
            textDirection={resolvedDirection}
          />
        )}

        {/* Document Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>{document.statement}</h1>

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
              <p>{t('noParagraphsYet') || 'No paragraphs in this document yet.'}</p>
            </div>
          ) : (
            paragraphs.map((paragraph) => (
              <ParagraphCard
                key={paragraph.paragraphId}
                paragraph={paragraph}
                documentId={document.statementId}
                isApproved={userApprovals[paragraph.paragraphId]}
                isLoggedIn={!!user}
                isAdmin={isAdmin}
                commentCount={commentCounts[paragraph.paragraphId] || 0}
                hasInteracted={userInteractionsSet.has(paragraph.paragraphId)}
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
                  {t('signInToReview') || 'Sign in to review and sign this document'}
                </p>
              ) : userSignature ? (
                <p className={styles.signedStatus}>
                  {userSignature.signed === 'signed' && (t('youHaveSigned') || 'You have signed this document')}
                  {userSignature.signed === 'rejected' && (t('youHaveRejected') || 'You have rejected this document')}
                  {userSignature.signed === 'viewed' && (t('youHaveViewed') || 'You have viewed this document')}
                </p>
              ) : (
                <p className={styles.unsignedStatus}>
                  {t('reviewAndSign') || 'Review all paragraphs and sign or reject the document'}
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
                  {t('signInToSign') || 'Sign In to Sign'}
                </a>
              ) : (
                <>
                  <RejectButton isRejected={userSignature?.signed === 'rejected'} />
                  <SignButton isSigned={userSignature?.signed === 'signed'} />
                </>
              )}
            </div>
          </footer>
        )}

        {/* Developed by credit */}
        <div className={styles.developedBy}>
          {t('developedBy') || 'Developed by'}{' '}
          <a href={DEVELOPED_BY_URL} target="_blank" rel="noopener noreferrer">
            WizCol
          </a>
        </div>
      </div>
      </DocumentClient>
  );
}

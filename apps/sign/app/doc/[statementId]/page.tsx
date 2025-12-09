import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  getDocumentForSigning,
  getParagraphsFromStatement,
  getUserSignature,
  getUserApprovals,
  getCommentCountsForDocument,
} from '@/lib/firebase/queries';
import { getUserFromCookies } from '@/lib/utils/user';
import DocumentView from '@/components/document/DocumentView';

interface PageProps {
  params: Promise<{ statementId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { statementId } = await params;
  const document = await getDocumentForSigning(statementId);

  if (!document) {
    return {
      title: 'Document Not Found - Freedi Sign',
    };
  }

  return {
    title: `${document.statement.substring(0, 50)} - Freedi Sign`,
    description: document.statement.substring(0, 160),
  };
}

export default async function DocumentPage({ params }: PageProps) {
  const { statementId } = await params;

  // Fetch document (includes paragraphs array)
  const document = await getDocumentForSigning(statementId);

  if (!document) {
    notFound();
  }

  // Extract paragraphs from document
  const paragraphs = getParagraphsFromStatement(document);
  const paragraphIds = paragraphs.map((p) => p.paragraphId);

  // Get user info from cookies
  const cookieStore = await cookies();
  const user = getUserFromCookies(cookieStore);

  // Fetch comment counts for all paragraphs (for all users, not just logged in)
  const commentCounts = await getCommentCountsForDocument(statementId, paragraphIds);

  // If user exists, get their signature and approvals
  let userSignature = null;
  let userApprovals: Awaited<ReturnType<typeof getUserApprovals>> = [];

  if (user) {
    [userSignature, userApprovals] = await Promise.all([
      getUserSignature(statementId, user.uid),
      getUserApprovals(statementId, user.uid),
    ]);
  }

  // Convert approvals array to a map for easier lookup
  // Note: approvals now use paragraphId instead of statementId
  const approvalsMap: Record<string, boolean> = {};
  userApprovals.forEach((approval) => {
    // Support both old (statementId) and new (paragraphId) formats
    const id = approval.paragraphId || approval.statementId;
    approvalsMap[id] = approval.approval;
  });

  return (
    <DocumentView
      document={document}
      paragraphs={paragraphs}
      user={user}
      userSignature={userSignature}
      userApprovals={approvalsMap}
      commentCounts={commentCounts}
    />
  );
}

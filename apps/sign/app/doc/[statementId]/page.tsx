import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  getDocumentForSigning,
  getDocumentParagraphs,
  getUserSignature,
  getUserApprovals,
  getCommentCountsForDocument,
  getUserInteractionsForDocument,
  getSuggestionCountsForDocument,
} from '@/lib/firebase/queries';
import { getUserFromCookies } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import DocumentView from '@/components/document/DocumentView';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import { TextDirection, TocSettings, TocPosition, ExplanationVideoMode, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME, HeaderColors, DEFAULT_HEADER_COLORS } from '@/types';

interface PageProps {
  params: Promise<{ statementId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { statementId } = await params;
  const document = await getDocumentForSigning(statementId);

  if (!document) {
    return {
      title: `Document Not Found - ${DEFAULT_BRAND_NAME}`,
    };
  }

  return {
    title: `${document.statement.substring(0, 50)} - ${DEFAULT_BRAND_NAME}`,
    description: document.statement.substring(0, 160),
  };
}

export default async function DocumentPage({ params }: PageProps) {
  const pageStart = Date.now();
  const { statementId } = await params;

  // Fetch document (includes paragraphs array)
  const docStart = Date.now();
  const document = await getDocumentForSigning(statementId);
  console.info(`[Perf] getDocumentForSigning: ${Date.now() - docStart}ms`);

  if (!document) {
    notFound();
  }

  // Get paragraphs from document (embedded, child options, or description fallback)
  const paraStart = Date.now();
  const paragraphs = await getDocumentParagraphs(document);
  console.info(`[Perf] getDocumentParagraphs: ${Date.now() - paraStart}ms`);
  const paragraphIds = paragraphs.map((p) => p.paragraphId);

  // Get user info from cookies
  const cookieStore = await cookies();
  const user = getUserFromCookies(cookieStore);

  // Debug: log cookie data
  const userIdCookie = cookieStore.get('userId');
  console.info('[DEBUG] Page cookies:', {
    hasUserId: !!userIdCookie,
    userId: userIdCookie?.value?.substring(0, 10) + '...',
    user: user ? { uid: user.uid.substring(0, 10) + '...', displayName: user.displayName } : null,
  });

  // Fetch comment counts for all paragraphs (for all users, not just logged in)
  const commentStart = Date.now();
  const commentCounts = await getCommentCountsForDocument(statementId, paragraphIds);
  console.info(`[Perf] getCommentCountsForDocument: ${Date.now() - commentStart}ms`);

  // If user exists, get their signature, approvals, interactions, and admin status
  let userSignature = null;
  let userApprovals: Awaited<ReturnType<typeof getUserApprovals>> = [];
  let userInteractions: Set<string> = new Set();
  let isAdmin = false;

  if (user) {
    const userStart = Date.now();
    const { db } = getFirebaseAdmin();
    const [signature, approvals, interactions, adminAccess] = await Promise.all([
      getUserSignature(statementId, user.uid),
      getUserApprovals(statementId, user.uid),
      getUserInteractionsForDocument(statementId, user.uid, paragraphIds),
      checkAdminAccess(db, statementId, user.uid),
    ]);
    console.info(`[Perf] User queries (parallel): ${Date.now() - userStart}ms`);
    userSignature = signature;
    userApprovals = approvals;
    userInteractions = interactions;
    isAdmin = adminAccess.isAdmin;

    // Debug: log admin check result
    console.info('[DEBUG] Admin check result:', {
      userId: user.uid.substring(0, 10) + '...',
      isAdmin: adminAccess.isAdmin,
      isOwner: adminAccess.isOwner,
      permissionLevel: adminAccess.permissionLevel,
    });
  }
  console.info(`[Perf] Total page load: ${Date.now() - pageStart}ms`);

  // Convert approvals array to a map for easier lookup
  // Note: approvals now use paragraphId instead of statementId
  const approvalsMap: Record<string, boolean> = {};
  userApprovals.forEach((approval) => {
    // Support both old (statementId) and new (paragraphId) formats
    const id = approval.paragraphId || approval.statementId;
    approvalsMap[id] = approval.approval;
  });

  // Convert Set to array for serialization (RSC can't serialize Sets)
  const userInteractionsArray = Array.from(userInteractions);

  // Get settings from document (with type assertion for signSettings)
  const signSettings = (document as { signSettings?: {
    textDirection?: TextDirection;
    defaultLanguage?: string;
    forceLanguage?: boolean;
    logoUrl?: string;
    brandName?: string;
    tocEnabled?: boolean;
    tocMaxLevel?: number;
    tocPosition?: TocPosition;
    enableSuggestions?: boolean;
    enhancedVisibility?: boolean;
    explanationVideoUrl?: string;
    explanationVideoMode?: ExplanationVideoMode;
    allowHeaderReactions?: boolean;
    headerColors?: HeaderColors;
  } }).signSettings;
  const textDirection: TextDirection = signSettings?.textDirection || 'auto';
  const defaultLanguage = signSettings?.defaultLanguage || '';
  const forceLanguage = signSettings?.forceLanguage ?? true;
  const logoUrl = signSettings?.logoUrl || DEFAULT_LOGO_URL;
  const brandName = signSettings?.brandName || DEFAULT_BRAND_NAME;

  // TOC settings
  const tocSettings: TocSettings = {
    tocEnabled: signSettings?.tocEnabled ?? false,
    tocMaxLevel: signSettings?.tocMaxLevel ?? 2,
    tocPosition: signSettings?.tocPosition ?? 'auto',
  };

  // Suggestions feature setting
  const enableSuggestions = signSettings?.enableSuggestions ?? false;

  // Accessibility setting - show ghosted buttons always for elderly users
  const enhancedVisibility = signSettings?.enhancedVisibility ?? false;

  // Explanation video settings
  const explanationVideoUrl = signSettings?.explanationVideoUrl || '';
  const explanationVideoMode: ExplanationVideoMode = signSettings?.explanationVideoMode || 'optional';

  // Header customization settings
  const allowHeaderReactions = signSettings?.allowHeaderReactions ?? false;
  const headerColors: HeaderColors = signSettings?.headerColors ?? DEFAULT_HEADER_COLORS;

  // Fetch suggestion counts if feature is enabled
  let suggestionCounts: Record<string, number> = {};
  if (enableSuggestions && paragraphIds.length > 0) {
    const suggestStart = Date.now();
    suggestionCounts = await getSuggestionCountsForDocument(statementId, paragraphIds);
    console.info(`[Perf] getSuggestionCountsForDocument: ${Date.now() - suggestStart}ms`);
  }

  // Serialize data to ensure it's JSON-compatible (removes Firebase Timestamps, etc.)
  const serializedDocument = JSON.parse(JSON.stringify(document));
  const serializedParagraphs = JSON.parse(JSON.stringify(paragraphs));
  const serializedUser = user ? JSON.parse(JSON.stringify(user)) : null;
  const serializedSignature = userSignature ? JSON.parse(JSON.stringify(userSignature)) : null;

  return (
    <LanguageOverrideProvider
      adminLanguage={defaultLanguage}
      forceLanguage={forceLanguage}
    >
      <DocumentView
        document={serializedDocument}
        paragraphs={serializedParagraphs}
        user={serializedUser}
        userSignature={serializedSignature}
        userApprovals={approvalsMap}
        commentCounts={commentCounts}
        suggestionCounts={suggestionCounts}
        userInteractions={userInteractionsArray}
        textDirection={textDirection}
        logoUrl={logoUrl}
        brandName={brandName}
        isAdmin={isAdmin}
        tocSettings={tocSettings}
        enableSuggestions={enableSuggestions}
        enhancedVisibility={enhancedVisibility}
        explanationVideoUrl={explanationVideoUrl}
        explanationVideoMode={explanationVideoMode}
        allowHeaderReactions={allowHeaderReactions}
        headerColors={headerColors}
      />
    </LanguageOverrideProvider>
  );
}

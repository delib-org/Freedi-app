/**
 * Server-side Firestore queries for Sign app
 */

import { getFirestoreAdmin } from './admin';
import { Collections, Statement, StatementType, Suggestion } from '@freedi/shared-types';
import { Paragraph, ParagraphType, StatementWithParagraphs } from '@/types';
import { descriptionToParagraphs, sortParagraphs } from '@/lib/utils/paragraphUtils';
import { logError } from '@/lib/utils/errorHandling';
import { QUERY_LIMITS, UI } from '@/constants/common';

// Types for Sign app
export interface Signature {
  signatureId: string;
  documentId: string;
  topParentId: string;
  parentId: string;
  userId: string;
  signed: 'signed' | 'rejected' | 'viewed';
  date: number;
  levelOfSignature?: number;
  rejectionReason?: string;
}

export interface Approval {
  approvalId: string;
  statementId: string;
  paragraphId?: string; // New: for embedded paragraphs
  documentId: string;
  topParentId: string;
  userId: string;
  approval: boolean;
  createdAt: number;
}

export interface Comment {
  statementId: string;
  parentId: string;
  topParentId: string;
  statement: string;
  creatorId: string;
  creatorDisplayName: string;
  createdAt: number;
  statementType: StatementType;
}

/**
 * Get a document (statement) for signing by ID
 * Accepts questions, options, or documents
 * Returns StatementWithParagraphs which includes the paragraphs array
 */
export async function getDocumentForSigning(documentId: string): Promise<StatementWithParagraphs | null> {
  try {
    const db = getFirestoreAdmin();
    const doc = await db.collection(Collections.statements).doc(documentId).get();

    if (!doc.exists) {
      console.info(`[Sign Queries] Document not found: ${documentId}`);

      return null;
    }

    const statement = doc.data() as StatementWithParagraphs;

    // Accept questions, options, or documents as signable
    const signableTypes: StatementType[] = [
      StatementType.question,
      StatementType.option,
      StatementType.document,
    ];

    if (!signableTypes.includes(statement.statementType)) {
      console.info(`[Sign Queries] Statement type not signable: ${statement.statementType}`);

      return null;
    }

    return statement;
  } catch (error) {
    logError(error, { operation: 'queries.getDocumentForSigning', documentId });
    throw error;
  }
}

/**
 * Extract and sort paragraphs from a statement (sync version)
 * Returns the paragraphs array sorted by order
 * Falls back to converting description to paragraphs if no paragraphs array exists
 * Note: Use getDocumentParagraphs for async version that also checks child options
 */
export function getParagraphsFromStatement(statement: StatementWithParagraphs): Paragraph[] {
  // If paragraphs array exists and has items, use it
  if (statement.paragraphs && statement.paragraphs.length > 0) {
    return sortParagraphs(statement.paragraphs);
  }

  // Fallback: Convert description to paragraphs
  const statementWithDescription = statement as StatementWithParagraphs & { description?: string };
  if (statementWithDescription.description) {
    return descriptionToParagraphs(statementWithDescription.description, statement.statementId);
  }

  return [];
}

/**
 * Convert child statements (options) to Paragraph format
 * Uses the statement's statementId as paragraphId for comment linking
 */
function childStatementsToParagraphs(statements: Statement[]): Paragraph[] {
  return statements.map((s, index) => ({
    paragraphId: s.statementId, // Use statementId so comments link correctly
    type: ParagraphType.paragraph,
    content: s.statement,
    order: index,
  }));
}

/**
 * Get all paragraphs for a document (async version)
 * Tries multiple sources in order:
 * 1. Official paragraph statements (doc.isOfficialParagraph = true)
 * 2. Embedded paragraphs array on statement (legacy)
 * 3. Child options (statements with parentId = documentId, legacy)
 * 4. Description field converted to paragraph (legacy)
 *
 * If legacy data exists, triggers automatic migration to statement-based paragraphs
 */
export async function getDocumentParagraphs(document: StatementWithParagraphs): Promise<Paragraph[]> {
  // 1. Try official paragraph statements (new system)
  const officialParagraphs = await getOfficialParagraphs(document.statementId);
  if (officialParagraphs.length > 0) {
    console.info(`[Sign Queries] Using ${officialParagraphs.length} official paragraph statements`);
    // Convert Statement[] to Paragraph[] for backward compatibility
    // Include documentApproval for consensus display
    return officialParagraphs.map((stmt) => ({
      paragraphId: stmt.statementId,
      type: ParagraphType.paragraph, // TODO: Infer from doc field
      content: stmt.statement,
      order: stmt.doc?.order ?? 0,
      documentApproval: stmt.documentApproval, // Include approval stats for UI display
    }));
  }

  // 2. Check for embedded paragraphs array (legacy - trigger migration)
  if (document.paragraphs && document.paragraphs.length > 0) {
    console.info(`[Sign Queries] Using ${document.paragraphs.length} embedded paragraphs (will migrate)`);

    // Trigger lazy migration asynchronously (don't wait for it)
    // Import dynamically to avoid circular dependencies
    import('@/lib/migrations/migrateParagraphsToStatements').then(({ migrateParagraphsToStatements }) => {
      migrateParagraphsToStatements(document.statementId, document.creatorId).catch((error) => {
        logError(error, {
          operation: 'queries.getDocumentParagraphs.autoMigrate',
          documentId: document.statementId,
        });
      });
    }).catch((error) => {
      logError(error, {
        operation: 'queries.getDocumentParagraphs.importMigration',
        documentId: document.statementId,
      });
    });

    return sortParagraphs(document.paragraphs);
  }

  // 3. Query for child options as paragraphs (legacy)
  const childOptions = await getParagraphsByParent(document.statementId);
  if (childOptions.length > 0) {
    console.info(`[Sign Queries] Using ${childOptions.length} child options as paragraphs`);
    return childStatementsToParagraphs(childOptions);
  }

  // 4. Fallback: Convert description to paragraph (legacy)
  const statementWithDescription = document as StatementWithParagraphs & { description?: string };
  if (statementWithDescription.description) {
    console.info('[Sign Queries] Using description as paragraph fallback');
    return descriptionToParagraphs(statementWithDescription.description, document.statementId);
  }

  console.info('[Sign Queries] No paragraphs found');
  return [];
}

/**
 * Get paragraphs (options) for a document
 * These are the items users will approve/reject individually
 */
export async function getParagraphsByParent(parentId: string): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .orderBy('createdAt', 'asc')
      .limit(QUERY_LIMITS.PARAGRAPHS)
      .get();

    const paragraphs = snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);

    console.info(`[Sign Queries] Found ${paragraphs.length} paragraphs for parent: ${parentId}`);

    return paragraphs;
  } catch (error) {
    logError(error, { operation: 'queries.getParagraphsByParent', documentId: parentId });
    throw error;
  }
}

/**
 * Get all paragraphs hierarchically (including nested ones)
 */
export async function getAllParagraphsForDocument(documentId: string): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    // Get all statements where topParentId matches and they are options
    const snapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.option)
      .orderBy('createdAt', 'asc')
      .get();

    const paragraphs = snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);

    console.info(`[Sign Queries] Found ${paragraphs.length} total paragraphs for document: ${documentId}`);

    return paragraphs;
  } catch (error) {
    logError(error, { operation: 'queries.getAllParagraphsForDocument', documentId });
    throw error;
  }
}

/**
 * Get user's signature for a document
 */
export async function getUserSignature(
  documentId: string,
  userId: string
): Promise<Signature | null> {
  try {
    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${documentId}`;

    const doc = await db.collection(Collections.signatures).doc(signatureId).get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as Signature;
  } catch (error) {
    logError(error, { operation: 'queries.getUserSignature', documentId, userId });
    throw error;
  }
}

/**
 * Get all signatures for a document
 */
export async function getDocumentSignatures(documentId: string): Promise<Signature[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.signatures)
      .where('documentId', '==', documentId)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Signature);
  } catch (error) {
    logError(error, { operation: 'queries.getDocumentSignatures', documentId });
    throw error;
  }
}

/**
 * Get user's approvals for a document
 */
export async function getUserApprovals(
  documentId: string,
  userId: string
): Promise<Approval[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.approval)
      .where('documentId', '==', documentId)
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Approval);
  } catch (error) {
    logError(error, { operation: 'queries.getUserApprovals', documentId, userId });
    throw error;
  }
}

/**
 * Get all approvals for a paragraph
 */
export async function getParagraphApprovals(paragraphId: string): Promise<Approval[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.approval)
      .where('statementId', '==', paragraphId)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Approval);
  } catch (error) {
    logError(error, { operation: 'queries.getParagraphApprovals', paragraphId });
    throw error;
  }
}

/**
 * Get comments for a paragraph
 */
export async function getComments(paragraphId: string): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', paragraphId)
      .where('statementType', '==', StatementType.statement) // Comments are regular statements
      .orderBy('createdAt', 'asc')
      .limit(QUERY_LIMITS.COMMENTS)
      .get();

    return snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);
  } catch (error) {
    logError(error, { operation: 'queries.getComments', paragraphId });
    throw error;
  }
}

/**
 * Get comment counts for all paragraphs in a document
 * Returns a map of paragraphId -> commentCount
 */
export async function getCommentCountsForDocument(
  documentId: string,
  paragraphIds: string[]
): Promise<Record<string, number>> {
  try {
    const db = getFirestoreAdmin();
    const commentCounts: Record<string, number> = {};

    // Initialize all paragraphs with 0
    paragraphIds.forEach((id) => {
      commentCounts[id] = 0;
    });

    if (paragraphIds.length === 0) {
      return commentCounts;
    }

    // Query all comments for this document (using topParentId)
    const snapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.statement)
      .get();

    // Count non-hidden comments per paragraph
    snapshot.docs.forEach((doc) => {
      const comment = doc.data() as Statement;
      if (!comment.hide && paragraphIds.includes(comment.parentId)) {
        commentCounts[comment.parentId] = (commentCounts[comment.parentId] || 0) + 1;
      }
    });

    return commentCounts;
  } catch (error) {
    logError(error, { operation: 'queries.getCommentCountsForDocument', documentId });
    return {};
  }
}

/**
 * Get user's interactions (comments and evaluations) for paragraphs in a document
 * Returns a set of paragraphIds where the user has interacted
 */
export async function getUserInteractionsForDocument(
  documentId: string,
  userId: string,
  paragraphIds: string[]
): Promise<Set<string>> {
  try {
    const db = getFirestoreAdmin();
    const interactedParagraphs = new Set<string>();

    if (!userId || paragraphIds.length === 0) {
      return interactedParagraphs;
    }

    // Query 1: Get user's comments (statements where creatorId = userId and parentId is a paragraphId)
    const commentsSnapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('creatorId', '==', userId)
      .where('statementType', '==', StatementType.statement)
      .get();

    commentsSnapshot.docs.forEach((doc) => {
      const comment = doc.data() as Statement;
      if (!comment.hide && paragraphIds.includes(comment.parentId)) {
        interactedParagraphs.add(comment.parentId);
      }
    });

    // Query 2: Get user's evaluations on comments in this document
    // Evaluations have parentId = paragraphId (the paragraph the comment belongs to)
    const evaluationsSnapshot = await db
      .collection(Collections.evaluations)
      .where('evaluatorId', '==', userId)
      .get();

    evaluationsSnapshot.docs.forEach((doc) => {
      const evaluation = doc.data();
      // Check if the evaluation's parentId is one of our paragraphs
      if (evaluation.parentId && paragraphIds.includes(evaluation.parentId)) {
        interactedParagraphs.add(evaluation.parentId);
      }
    });

    console.info(`[Sign Queries] User ${userId} has interacted with ${interactedParagraphs.size} paragraphs`);

    return interactedParagraphs;
  } catch (error) {
    logError(error, { operation: 'queries.getUserInteractionsForDocument', documentId, userId });
    return new Set<string>();
  }
}

export interface DocumentStats {
  totalParticipants: number;
  signedCount: number;
  rejectedCount: number;
  viewedCount: number;
  totalComments: number;
  averageApproval: number;
  topParagraphs: Array<{
    paragraphId: string;
    statement: string;
    approvalCount: number;
    commentCount: number;
    avgApproval: number;
  }>;
}

/**
 * Get document statistics (for admin panel)
 * Updated to work with embedded paragraphs
 */
export async function getDocumentStats(documentId: string): Promise<DocumentStats> {
  try {
    const db = getFirestoreAdmin();

    // Get the document with embedded paragraphs
    const documentSnapshot = await db
      .collection(Collections.statements)
      .doc(documentId)
      .get();

    const document = documentSnapshot.exists
      ? (documentSnapshot.data() as StatementWithParagraphs)
      : null;

    // Get paragraphs from the document
    const paragraphs = document?.paragraphs || [];

    // Get signatures
    const signaturesSnapshot = await db
      .collection(Collections.signatures)
      .where('documentId', '==', documentId)
      .get();

    const signatures = signaturesSnapshot.docs.map((doc) => doc.data() as Signature);
    const signedCount = signatures.filter((s) => s.signed === 'signed').length;
    const rejectedCount = signatures.filter((s) => s.signed === 'rejected').length;
    const viewedCount = signatures.filter((s) => s.signed === 'viewed').length;

    // Get comment counts per paragraph
    const paragraphIds = paragraphs.map((p) => p.paragraphId);
    const commentCounts = await getCommentCountsForDocument(documentId, paragraphIds);
    const totalComments = Object.values(commentCounts).reduce((sum, count) => sum + count, 0);

    // Get all approvals for the document
    const approvalsSnapshot = await db
      .collection(Collections.approval)
      .where('documentId', '==', documentId)
      .get();

    const approvals = approvalsSnapshot.docs.map((doc) => doc.data() as Approval);

    // Calculate average approval on -1 to 1 scale (approve = 1, reject = -1)
    const totalApprovalValue = approvals.reduce((sum, a) => sum + (a.approval ? 1 : -1), 0);
    const averageApproval = approvals.length > 0 ? totalApprovalValue / approvals.length : 0;

    // Build top paragraphs with stats using embedded paragraphs
    const topParagraphs = paragraphs.map((p) => {
      // Match approvals by paragraphId (new) or statementId (legacy)
      const paragraphApprovals = approvals.filter(
        (a) => a.paragraphId === p.paragraphId || a.statementId === p.paragraphId
      );
      const approvalCount = paragraphApprovals.length;
      const approvalSum = paragraphApprovals.reduce((sum, a) => sum + (a.approval ? 1 : -1), 0);
      const avgApproval = approvalCount > 0 ? approvalSum / approvalCount : 0;

      return {
        paragraphId: p.paragraphId,
        statement: p.content || '',
        approvalCount,
        commentCount: commentCounts[p.paragraphId] || 0,
        avgApproval,
      };
    });

    // Sort by approval count and take top 10
    topParagraphs.sort((a, b) => b.approvalCount - a.approvalCount);

    return {
      totalParticipants: signatures.length,
      signedCount,
      rejectedCount,
      viewedCount,
      totalComments,
      averageApproval: Math.round(averageApproval * 100) / 100,
      topParagraphs: topParagraphs.slice(0, UI.TOP_PARAGRAPHS_LIMIT),
    };
  } catch (error) {
    logError(error, { operation: 'queries.getDocumentStats', documentId });
    return {
      totalParticipants: 0,
      signedCount: 0,
      rejectedCount: 0,
      viewedCount: 0,
      totalComments: 0,
      averageApproval: 0,
      topParagraphs: [],
    };
  }
}

/**
 * Get suggestions for a paragraph
 */
export async function getSuggestions(paragraphId: string): Promise<Suggestion[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.suggestions)
      .where('paragraphId', '==', paragraphId)
      .where('hide', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(QUERY_LIMITS.SUGGESTIONS)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Suggestion);
  } catch (error) {
    logError(error, { operation: 'queries.getSuggestions', paragraphId });
    throw error;
  }
}

/**
 * Get suggestion counts for all paragraphs in a document
 * Returns a map of paragraphId -> suggestionCount
 *
 * Queries the statements collection for suggestion statements (children of official paragraphs)
 */
export async function getSuggestionCountsForDocument(
  documentId: string,
  paragraphIds: string[]
): Promise<Record<string, number>> {
  try {
    const db = getFirestoreAdmin();
    const suggestionCounts: Record<string, number> = {};

    // Initialize all paragraphs with 0
    paragraphIds.forEach((id) => {
      suggestionCounts[id] = 0;
    });

    if (paragraphIds.length === 0) {
      return suggestionCounts;
    }

    // Query all suggestion statements for this document
    // Suggestions are statements where:
    // - statementType is 'option'
    // - parentId is one of the official paragraphs
    // - doc.isOfficialParagraph is not true (filter out official paragraphs themselves)
    const snapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.option)
      .get();

    // Count suggestions per paragraph (filter and count client-side)
    snapshot.docs.forEach((doc) => {
      const statement = doc.data() as Statement;

      // Only count if:
      // 1. Not hidden
      // 2. ParentId is a paragraph (not the document itself)
      // 3. Not an official paragraph
      if (
        !statement.hide &&
        statement.parentId &&
        paragraphIds.includes(statement.parentId) &&
        !statement.doc?.isOfficialParagraph
      ) {
        suggestionCounts[statement.parentId] = (suggestionCounts[statement.parentId] || 0) + 1;
      }
    });

    return suggestionCounts;
  } catch (error) {
    logError(error, { operation: 'queries.getSuggestionCountsForDocument', documentId });
    return {};
  }
}

/**
 * Get user's suggestion for a specific paragraph
 */
export async function getUserSuggestion(
  paragraphId: string,
  userId: string
): Promise<Suggestion | null> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.suggestions)
      .where('paragraphId', '==', paragraphId)
      .where('creatorId', '==', userId)
      .where('hide', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as Suggestion;
  } catch (error) {
    logError(error, { operation: 'queries.getUserSuggestion', paragraphId, userId });
    throw error;
  }
}

/**
 * Get official "standing" paragraphs for a document
 * These are the paragraphs marked with doc.isOfficialParagraph = true
 * Returns paragraphs sorted by doc.order
 *
 * @param documentId - The document ID
 * @returns Array of official paragraph statements
 */
export async function getOfficialParagraphs(documentId: string): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', documentId)
      .where('doc.isOfficialParagraph', '==', true)
      .orderBy('doc.order', 'asc')
      .limit(QUERY_LIMITS.PARAGRAPHS)
      .get();

    const paragraphs = snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);

    console.info(`[Sign Queries] Found ${paragraphs.length} official paragraphs for document: ${documentId}`);

    return paragraphs;
  } catch (error) {
    logError(error, { operation: 'queries.getOfficialParagraphs', documentId });
    throw error;
  }
}

/**
 * Get suggestion statements for a specific official paragraph
 * These are child statements (parentId = paragraphId) that represent alternative text
 * Returns suggestions sorted by consensus (descending)
 *
 * @param paragraphId - The official paragraph ID
 * @returns Array of suggestion statements
 */
export async function getSuggestionsByParagraph(paragraphId: string): Promise<Statement[]> {
  try {
    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', paragraphId)
      .where('statementType', '==', StatementType.option)
      .orderBy('consensus', 'desc')
      .limit(QUERY_LIMITS.SUGGESTIONS)
      .get();

    const suggestions = snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide && !s.doc?.isOfficialParagraph); // Exclude official paragraphs

    console.info(`[Sign Queries] Found ${suggestions.length} suggestions for paragraph: ${paragraphId}`);

    return suggestions;
  } catch (error) {
    logError(error, { operation: 'queries.getSuggestionsByParagraph', paragraphId });
    throw error;
  }
}

/**
 * Get the winning suggestion for an official paragraph
 * Returns the suggestion with the highest consensus
 *
 * @param paragraphId - The official paragraph ID
 * @returns The winning suggestion statement, or null if no suggestions exist
 */
export async function getWinningSuggestion(paragraphId: string): Promise<Statement | null> {
  try {
    const suggestions = await getSuggestionsByParagraph(paragraphId);

    if (suggestions.length === 0) {
      return null;
    }

    // Already sorted by consensus (descending), so first is winner
    return suggestions[0]!;
  } catch (error) {
    logError(error, { operation: 'queries.getWinningSuggestion', paragraphId });
    throw error;
  }
}

/**
 * Get all suggestions for a document (across all paragraphs)
 * Returns a map of paragraphId -> array of suggestion statements
 *
 * @param documentId - The document ID
 * @returns Map of paragraph IDs to their suggestions
 */
export async function getAllSuggestionsForDocument(
  documentId: string
): Promise<Record<string, Statement[]>> {
  try {
    const db = getFirestoreAdmin();

    // Query all suggestions (statements with topParentId = documentId that are children of official paragraphs)
    const snapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.option)
      .orderBy('consensus', 'desc')
      .get();

    const suggestionMap: Record<string, Statement[]> = {};

    snapshot.docs.forEach((doc) => {
      const statement = doc.data() as Statement;

      // Skip official paragraphs (only get suggestions)
      if (statement.doc?.isOfficialParagraph || statement.hide) {
        return;
      }

      // Group by parentId (which is the official paragraph ID)
      const paragraphId = statement.parentId;
      if (!suggestionMap[paragraphId]) {
        suggestionMap[paragraphId] = [];
      }
      suggestionMap[paragraphId]!.push(statement);
    });

    console.info(`[Sign Queries] Found suggestions for ${Object.keys(suggestionMap).length} paragraphs in document: ${documentId}`);

    return suggestionMap;
  } catch (error) {
    logError(error, { operation: 'queries.getAllSuggestionsForDocument', documentId });
    throw error;
  }
}

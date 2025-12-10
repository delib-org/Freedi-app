/**
 * Server-side Firestore queries for Sign app
 */

import { getFirestoreAdmin } from './admin';
import { Collections, Statement, StatementType } from 'delib-npm';
import { Paragraph, StatementWithParagraphs } from '@/types';

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
    console.error('[Sign Queries] Error getting document:', error);
    throw error;
  }
}

/**
 * Extract and sort paragraphs from a statement
 * Returns the paragraphs array sorted by order
 */
export function getParagraphsFromStatement(statement: StatementWithParagraphs): Paragraph[] {
  if (!statement.paragraphs || statement.paragraphs.length === 0) {
    return [];
  }

  // Sort by order and return
  return [...statement.paragraphs].sort((a, b) => a.order - b.order);
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
      .limit(200)
      .get();

    const paragraphs = snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);

    console.info(`[Sign Queries] Found ${paragraphs.length} paragraphs for parent: ${parentId}`);

    return paragraphs;
  } catch (error) {
    console.error('[Sign Queries] Error getting paragraphs:', error);
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
    console.error('[Sign Queries] Error getting all paragraphs:', error);
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
    console.error('[Sign Queries] Error getting signature:', error);
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
    console.error('[Sign Queries] Error getting document signatures:', error);
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
    console.error('[Sign Queries] Error getting user approvals:', error);
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
    console.error('[Sign Queries] Error getting paragraph approvals:', error);
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
      .limit(100)
      .get();

    return snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((s) => !s.hide);
  } catch (error) {
    console.error('[Sign Queries] Error getting comments:', error);
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
    console.error('[Sign Queries] Error getting comment counts:', error);

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
    console.error('[Sign Queries] Error getting user interactions:', error);

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
      topParagraphs: topParagraphs.slice(0, 10),
    };
  } catch (error) {
    console.error('[Sign Queries] Error getting document stats:', error);

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

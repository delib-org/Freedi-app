/**
 * Server-side Firestore queries for Sign app
 */

import { getFirestoreAdmin } from './admin';
import { Collections, Statement, StatementType } from 'delib-npm';

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
 */
export async function getDocumentForSigning(documentId: string): Promise<Statement | null> {
  try {
    const db = getFirestoreAdmin();
    const doc = await db.collection(Collections.statements).doc(documentId).get();

    if (!doc.exists) {
      console.info(`[Sign Queries] Document not found: ${documentId}`);

      return null;
    }

    const statement = doc.data() as Statement;

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
 */
export async function getDocumentStats(documentId: string): Promise<DocumentStats> {
  try {
    const db = getFirestoreAdmin();

    // Get signatures
    const signaturesSnapshot = await db
      .collection(Collections.signatures)
      .where('documentId', '==', documentId)
      .get();

    const signatures = signaturesSnapshot.docs.map((doc) => doc.data() as Signature);
    const signedCount = signatures.filter((s) => s.signed === 'signed').length;
    const rejectedCount = signatures.filter((s) => s.signed === 'rejected').length;
    const viewedCount = signatures.filter((s) => s.signed === 'viewed').length;

    // Get paragraphs
    const paragraphsSnapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.option)
      .get();

    const paragraphs = paragraphsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Array<Statement & { id: string }>;

    // Get comment count
    const commentsSnapshot = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', StatementType.statement)
      .count()
      .get();

    // Get all approvals for the document
    const approvalsSnapshot = await db
      .collection(Collections.approval)
      .where('documentId', '==', documentId)
      .get();

    const approvals = approvalsSnapshot.docs.map((doc) => doc.data() as Approval);

    // Calculate average approval
    const totalApprovalValue = approvals.reduce((sum, a) => sum + (a.approval ? 1 : 0), 0);
    const averageApproval = approvals.length > 0 ? (totalApprovalValue / approvals.length) * 5 : 0;

    // Build top paragraphs with stats
    const topParagraphs = paragraphs.map((p) => {
      const paragraphApprovals = approvals.filter((a) => a.statementId === p.statementId);
      const approvalCount = paragraphApprovals.length;
      const approvalSum = paragraphApprovals.reduce((sum, a) => sum + (a.approval ? 1 : 0), 0);
      const avgApproval = approvalCount > 0 ? (approvalSum / approvalCount) * 5 : 0;

      return {
        paragraphId: p.statementId,
        statement: p.statement || '',
        approvalCount,
        commentCount: 0, // Would need separate query per paragraph
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
      totalComments: commentsSnapshot.data().count,
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

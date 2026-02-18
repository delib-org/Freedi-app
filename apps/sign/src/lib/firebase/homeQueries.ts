/**
 * Server-side Firestore queries for the home page
 * Fetches all documents a user has access to (created, collaborated, invited, signed)
 */

import { getFirestoreAdmin } from './admin';
import { Collections, StatementType, Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { QUERY_LIMITS, FIREBASE } from '@/constants/common';

export interface HomeDocument {
  statementId: string;
  statement: string;
  description?: string;
  createdAt: number;
  lastUpdate: number;
  creatorId: string;
  creatorDisplayName: string;
  parentId: string;
  groupName?: string;
  relationship: 'created' | 'collaborator' | 'invited' | 'signed';
  userRole: 'owner' | 'admin' | 'viewer' | 'signer';
  signatureStatus?: 'signed' | 'rejected' | 'viewed' | null;
  signedCount: number;
  rejectedCount: number;
}

export interface GroupInfo {
  statementId: string;
  statement: string;
  createdAt: number;
}

interface SignatureCounts {
  signedCount: number;
  rejectedCount: number;
}

/**
 * Get all documents and groups for a user's home page
 */
export async function getUserHomeDocuments(
  userId: string,
  userEmail?: string
): Promise<{ documents: HomeDocument[]; groups: GroupInfo[] }> {
  try {
    const db = getFirestoreAdmin();

    // Run queries in parallel
    const [createdDocs, collaboratedDocs, invitedDocs, signedDocs, groups] = await Promise.all([
      getCreatedDocuments(db, userId),
      getCollaboratedDocuments(db, userId),
      userEmail ? getInvitedDocuments(db, userEmail) : Promise.resolve([]),
      getSignedDocuments(db, userId),
      getUserGroups(db, userId),
    ]);

    // Merge into a Map keyed by statementId, priority: created > collaborator > invited > signed
    const documentMap = new Map<string, HomeDocument>();

    // Add signed first (lowest priority)
    for (const doc of signedDocs) {
      documentMap.set(doc.statementId, doc);
    }

    // Add invited (overrides signed)
    for (const doc of invitedDocs) {
      documentMap.set(doc.statementId, doc);
    }

    // Add collaborated (overrides invited)
    for (const doc of collaboratedDocs) {
      documentMap.set(doc.statementId, doc);
    }

    // Add created (highest priority)
    for (const doc of createdDocs) {
      documentMap.set(doc.statementId, doc);
    }

    // Batch-fetch signature counts for all documents
    const allDocIds = Array.from(documentMap.keys());
    const signatureCounts = await batchGetSignatureCounts(db, allDocIds);

    // Merge signature counts into documents
    for (const [docId, counts] of Object.entries(signatureCounts)) {
      const doc = documentMap.get(docId);
      if (doc) {
        doc.signedCount = counts.signedCount;
        doc.rejectedCount = counts.rejectedCount;
      }
    }

    // Also resolve group names for documents that have a parentId
    const groupMap = new Map<string, string>();
    for (const group of groups) {
      groupMap.set(group.statementId, group.statement);
    }

    for (const doc of documentMap.values()) {
      if (doc.parentId && doc.parentId !== 'top' && groupMap.has(doc.parentId)) {
        doc.groupName = groupMap.get(doc.parentId);
      }
    }

    // Sort by lastUpdate descending
    const documents = Array.from(documentMap.values()).sort(
      (a, b) => b.lastUpdate - a.lastUpdate
    );

    return { documents, groups };
  } catch (error) {
    logError(error, {
      operation: 'homeQueries.getUserHomeDocuments',
      userId,
    });

    return { documents: [], groups: [] };
  }
}

/**
 * Get documents created by the user
 */
async function getCreatedDocuments(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<HomeDocument[]> {
  try {
    const snapshot = await db
      .collection(Collections.statements)
      .where('creatorId', '==', userId)
      .where('statementType', 'in', [
        StatementType.question,
        StatementType.option,
        StatementType.document,
      ])
      .orderBy('lastUpdate', 'desc')
      .limit(QUERY_LIMITS.HOME_DOCUMENTS)
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as Statement;

        // Options only appear if explicitly marked as documents
        if (data.statementType === StatementType.option && data.isDocument !== true) {
          return null;
        }

        return statementToHomeDocument(data, 'created', 'owner');
      })
      .filter((doc): doc is HomeDocument => doc !== null);
  } catch (error) {
    logError(error, { operation: 'homeQueries.getCreatedDocuments', userId });

    return [];
  }
}

/**
 * Get documents where user is a collaborator
 */
async function getCollaboratedDocuments(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<HomeDocument[]> {
  try {
    const snapshot = await db
      .collection(Collections.documentCollaborators)
      .where('userId', '==', userId)
      .limit(QUERY_LIMITS.HOME_DOCUMENTS)
      .get();

    if (snapshot.empty) return [];

    // Get the document IDs from collaborator records
    const docIds = snapshot.docs
      .map((doc) => doc.data().documentId as string | undefined)
      .filter((id): id is string => !!id);

    if (docIds.length === 0) return [];

    // Batch fetch the actual documents
    const documents = await batchGetDocuments(db, docIds);

    return documents.map((data) =>
      statementToHomeDocument(data, 'collaborator', 'admin')
    ).filter((doc): doc is HomeDocument => doc !== null);
  } catch (error) {
    logError(error, { operation: 'homeQueries.getCollaboratedDocuments', userId });

    return [];
  }
}

/**
 * Get documents where user was invited (accepted invitations)
 */
async function getInvitedDocuments(
  db: FirebaseFirestore.Firestore,
  userEmail: string
): Promise<HomeDocument[]> {
  try {
    const snapshot = await db
      .collection(Collections.adminInvitations)
      .where('invitedEmail', '==', userEmail)
      .where('status', '==', 'accepted')
      .limit(QUERY_LIMITS.HOME_DOCUMENTS)
      .get();

    if (snapshot.empty) return [];

    const docIds = snapshot.docs
      .map((doc) => doc.data().documentId as string | undefined)
      .filter((id): id is string => !!id);

    if (docIds.length === 0) return [];

    const documents = await batchGetDocuments(db, docIds);

    return documents.map((data) =>
      statementToHomeDocument(data, 'invited', 'admin')
    ).filter((doc): doc is HomeDocument => doc !== null);
  } catch (error) {
    logError(error, { operation: 'homeQueries.getInvitedDocuments', metadata: { userEmail } });

    return [];
  }
}

/**
 * Get documents the user has signed/viewed
 */
async function getSignedDocuments(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<HomeDocument[]> {
  try {
    const snapshot = await db
      .collection(Collections.signatures)
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .limit(QUERY_LIMITS.HOME_DOCUMENTS)
      .get();

    if (snapshot.empty) return [];

    // Build a map of documentId -> signature status
    const signatureMap = new Map<string, 'signed' | 'rejected' | 'viewed'>();
    const docIds: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const documentId = data.documentId as string | undefined;
      if (documentId && !signatureMap.has(documentId)) {
        signatureMap.set(documentId, data.signed as 'signed' | 'rejected' | 'viewed');
        docIds.push(documentId);
      }
    }

    if (docIds.length === 0) return [];

    const documents = await batchGetDocuments(db, docIds);

    return documents.map((data) => {
      const doc = statementToHomeDocument(data, 'signed', 'signer');
      if (doc) {
        doc.signatureStatus = signatureMap.get(data.statementId) ?? null;
      }

      return doc;
    }).filter((doc): doc is HomeDocument => doc !== null);
  } catch (error) {
    logError(error, { operation: 'homeQueries.getSignedDocuments', userId });

    return [];
  }
}

/**
 * Get user's groups
 */
async function getUserGroups(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<GroupInfo[]> {
  try {
    const snapshot = await db
      .collection(Collections.statements)
      .where('creatorId', '==', userId)
      .where('statementType', '==', StatementType.group)
      .orderBy('createdAt', 'desc')
      .limit(QUERY_LIMITS.HOME_DOCUMENTS)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        statementId: data.statementId as string,
        statement: data.statement as string,
        createdAt: toMillis(data.createdAt),
      };
    });
  } catch (error) {
    logError(error, { operation: 'homeQueries.getUserGroups', userId });

    return [];
  }
}

/**
 * Batch fetch documents by IDs using Firestore 'in' queries
 */
async function batchGetDocuments(
  db: FirebaseFirestore.Firestore,
  docIds: string[]
): Promise<Statement[]> {
  const results: Statement[] = [];
  const uniqueIds = [...new Set(docIds)];

  for (let i = 0; i < uniqueIds.length; i += FIREBASE.IN_QUERY_LIMIT) {
    const batch = uniqueIds.slice(i, i + FIREBASE.IN_QUERY_LIMIT);

    const snapshot = await db
      .collection(Collections.statements)
      .where('statementId', 'in', batch)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data() as Statement;
      // Options only appear if explicitly marked as documents
      if (data.statementType === StatementType.option && data.isDocument !== true) {
        continue;
      }
      // Include questions, documents, and marked options
      if (
        data.statementType === StatementType.question ||
        data.statementType === StatementType.option ||
        data.statementType === StatementType.document ||
        data.isDocument === true
      ) {
        results.push(data);
      }
    }
  }

  return results;
}

/**
 * Batch fetch signature counts for documents
 */
async function batchGetSignatureCounts(
  db: FirebaseFirestore.Firestore,
  docIds: string[]
): Promise<Record<string, SignatureCounts>> {
  const counts: Record<string, SignatureCounts> = {};

  if (docIds.length === 0) return counts;

  // Initialize all with zero
  for (const id of docIds) {
    counts[id] = { signedCount: 0, rejectedCount: 0 };
  }

  const uniqueIds = [...new Set(docIds)];

  for (let i = 0; i < uniqueIds.length; i += FIREBASE.IN_QUERY_LIMIT) {
    const batch = uniqueIds.slice(i, i + FIREBASE.IN_QUERY_LIMIT);

    const snapshot = await db
      .collection(Collections.signatures)
      .where('documentId', 'in', batch)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const documentId = data.documentId as string;
      if (!counts[documentId]) {
        counts[documentId] = { signedCount: 0, rejectedCount: 0 };
      }
      if (data.signed === 'signed') {
        counts[documentId].signedCount++;
      } else if (data.signed === 'rejected') {
        counts[documentId].rejectedCount++;
      }
    }
  }

  return counts;
}

/**
 * Convert a Statement to a HomeDocument
 */
function statementToHomeDocument(
  data: Statement,
  relationship: HomeDocument['relationship'],
  userRole: HomeDocument['userRole']
): HomeDocument | null {
  if (!data.statementId || !data.statement) return null;

  // description is stored in Firestore but not in the Statement type
  const dataWithDescription = data as Statement & { description?: string };

  return {
    statementId: data.statementId,
    statement: data.statement,
    description: dataWithDescription.description || undefined,
    createdAt: toMillis(data.createdAt),
    lastUpdate: toMillis(data.lastUpdate),
    creatorId: data.creatorId || '',
    creatorDisplayName: data.creator?.displayName || '',
    parentId: data.parentId || 'top',
    relationship,
    userRole,
    signatureStatus: null,
    signedCount: 0,
    rejectedCount: 0,
  };
}

/**
 * Safely convert a timestamp value to milliseconds
 */
function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof value === 'object' && '_seconds' in value) {
    return (value as { _seconds: number })._seconds * 1000;
  }

  return Date.now();
}

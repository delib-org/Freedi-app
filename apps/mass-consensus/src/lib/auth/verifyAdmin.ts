import { getAuth } from 'firebase-admin/auth';
import { Collections, Role } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../firebase/admin';
import { initializeFirebaseAdmin } from '../firebase/admin';
import { logError } from '../utils/errorHandling';

export interface AdminVerificationResult {
  isAdmin: boolean;
  userId: string;
  error?: string;
}

/**
 * Verify a Firebase ID token and check if the user has admin privileges
 * @param token - Firebase ID token from Authorization header
 * @returns Verification result with admin status and userId
 */
export async function verifyAdmin(token: string): Promise<AdminVerificationResult> {
  try {
    // Ensure Firebase Admin is initialized
    initializeFirebaseAdmin();

    // Verify the ID token
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check if user has admin role in any statement subscription
    const db = getFirestoreAdmin();
    const adminSubscriptions = await db
      .collection(Collections.statementsSubscribe)
      .where('userId', '==', userId)
      .where('role', '==', Role.admin)
      .limit(1)
      .get();

    const isAdmin = !adminSubscriptions.empty;

    console.info('[verifyAdmin] User:', userId, 'isAdmin:', isAdmin);

    return {
      isAdmin,
      userId,
    };
  } catch (error) {
    logError(error, { operation: 'verifyAdmin.verifyAdmin' });

    return {
      isAdmin: false,
      userId: '',
      error: error instanceof Error ? error.message : 'Token verification failed',
    };
  }
}

/**
 * Verify a Firebase ID token only (without admin check)
 * Use this for authenticated endpoints that don't require admin privileges
 * @param token - Firebase ID token from Authorization header
 * @returns User ID if valid, null otherwise
 */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    initializeFirebaseAdmin();
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    logError(error, { operation: 'verifyAdmin.verifyToken' });
    return null;
  }
}

/**
 * Check if a user has admin access to a specific statement
 * @param userId - User ID
 * @param statementId - Statement ID to check access for
 * @returns True if user is admin of the statement
 */
export async function isAdminOfStatement(
  userId: string,
  statementId: string
): Promise<boolean> {
  try {
    const db = getFirestoreAdmin();

    // Check if user created the statement
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (statementDoc.exists) {
      const statement = statementDoc.data();
      if (statement?.creatorId === userId) {
        return true;
      }
    }

    // Check subscription for admin role
    const subscriptionId = `${userId}--${statementId}`;
    const subscriptionDoc = await db
      .collection(Collections.statementsSubscribe)
      .doc(subscriptionId)
      .get();

    if (subscriptionDoc.exists) {
      const subscription = subscriptionDoc.data();
      return subscription?.role === Role.admin;
    }

    return false;
  } catch (error) {
    logError(error, {
      operation: 'verifyAdmin.isAdminOfStatement',
      userId,
      statementId,
    });
    return false;
  }
}

/**
 * Extract Bearer token from Authorization header
 * @param authHeader - Authorization header value
 * @returns Token string or null
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

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
 * Firebase Admin error codes that mean "the caller sent a bad token" rather
 * than "something went wrong on our side".
 *
 * Two things land here constantly: a user whose session expired while a tab
 * was open, and internet background noise — scanners and uptime probes hitting
 * the admin API with a junk `Authorization` header. Both are answered correctly
 * with a 401, and neither is a fault anyone can act on. Reporting them to
 * Sentry buries real failures under traffic that will never stop arriving.
 *
 * Anything NOT listed here — `auth/internal-error`, a failure to reach the
 * certificate endpoint, a misconfigured service account — is still reported,
 * because those mean this deployment is broken.
 */
const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/user-disabled',
]);

function isInvalidTokenError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;

  return typeof code === 'string' && INVALID_TOKEN_CODES.has(code);
}

/**
 * Report a token-verification failure at the right volume: a rejected token is
 * an info-level fact about the request, everything else is an error.
 */
function reportTokenFailure(error: unknown, operation: string): void {
  if (isInvalidTokenError(error)) {
    console.info(`[${operation}] Rejected an invalid or expired ID token`);

    return;
  }

  logError(error, { operation });
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
    reportTokenFailure(error, 'verifyAdmin.verifyAdmin');

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
    reportTokenFailure(error, 'verifyAdmin.verifyToken');
    return null;
  }
}

export interface CallerIdentity {
  userId: string;
  /** Lowercased email from the auth token, or null (e.g. anonymous sign-in). */
  email: string | null;
  displayName: string;
}

/**
 * Verify a Firebase ID token and return the caller's identity, including the
 * email claim. Invitation acceptance needs the email — a uid alone cannot be
 * matched against the address an invite was sent to.
 * @param token - Firebase ID token from Authorization header
 * @returns Identity if the token is valid, null otherwise
 */
export async function verifyIdentity(token: string): Promise<CallerIdentity | null> {
  try {
    initializeFirebaseAdmin();
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const email = decodedToken.email?.trim().toLowerCase() || null;

    return {
      userId: decodedToken.uid,
      email,
      displayName: decodedToken.name?.trim() || email || 'A Freedi admin',
    };
  } catch (error) {
    reportTokenFailure(error, 'verifyAdmin.verifyIdentity');

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

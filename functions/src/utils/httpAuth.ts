/**
 * Authentication + authorization helpers for HTTP (onRequest) Cloud Functions.
 *
 * Extracted from index.ts so the security-critical gate can be unit-tested in
 * isolation (index.ts has heavy module-load side effects that make it
 * impractical to import from a test).
 */
import { Request, Response } from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { logError } from './errorHandling';

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Returns the authenticated user's UID, or sends a 401 and returns null.
 */
export async function verifyAuthToken(req: Request, res: Response): Promise<string | null> {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith('Bearer ')) {
		res.status(401).send({ error: 'Missing or invalid Authorization header' });

		return null;
	}
	try {
		const token = authHeader.split('Bearer ')[1];
		const decoded = await getAuth().verifyIdToken(token);

		return decoded.uid;
	} catch {
		res.status(401).send({ error: 'Invalid or expired token' });

		return null;
	}
}

/**
 * Checks whether a uid belongs to a system admin.
 * Mirrors isSystemAdmin() in firestore.rules and the check in
 * fn_deleteResearchLogs — the system-admin flag lives on usersV2/{uid}.
 * Fails closed (returns false) on any lookup error.
 */
export async function isSystemAdmin(uid: string): Promise<boolean> {
	try {
		const userDoc = await getFirestore().collection(Collections.users).doc(uid).get();

		return userDoc.exists && userDoc.data()?.systemAdmin === true;
	} catch (error) {
		logError(error, { operation: 'httpAuth.isSystemAdmin', metadata: { uid } });

		return false;
	}
}

/**
 * Authentication + authorization gate for admin/maintenance HTTP endpoints.
 * Returns the authenticated system-admin's UID, or writes the appropriate
 * 401/403 response and returns null. Authentication alone is NOT sufficient —
 * the caller must be a system admin (usersV2/{uid}.systemAdmin === true).
 */
export async function requireSystemAdmin(req: Request, res: Response): Promise<string | null> {
	const uid = await verifyAuthToken(req, res);
	if (!uid) return null;

	if (!(await isSystemAdmin(uid))) {
		res.status(403).json({ ok: false, error: 'Forbidden: system admin required' });

		return null;
	}

	return uid;
}

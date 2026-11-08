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
import {
	AdminPermissionLevel,
	Collections,
	StatementType,
	type DocumentCollaborator,
	type Statement,
} from '@freedi/shared-types';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';
import type { RateBudget } from '../config/rateBudgets';
import { logError } from './errorHandling';
import { passesHttpRateLimit } from './rateLimit';

/** An HTTP handler that received the uid from a verified ID token, never from the request. */
export type AuthedHttpHandler = (req: Request, res: Response, uid: string) => Promise<void> | void;

const TOP_PARENT_ID = 'top';

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

/**
 * Runs `handler` only for a caller with a valid Firebase ID token, handing it the
 * verified uid. Anonymous users have real tokens and pass, which is what keeps
 * the zero-signup MC and Join flows working.
 *
 * Handlers must take identity from this uid and ignore any userId, adminId or
 * creatorId in the body: those are claims the caller wrote.
 *
 * Give a `budget` here only when the caller needs no admin rights. Endpoints that
 * check ownership spend the budget after that check, inside the handler, so a
 * stranger's refused calls cannot use up the real admin's global ceiling.
 */
export function withVerifiedUser(
	handler: AuthedHttpHandler,
	budget?: RateBudget,
): (req: Request, res: Response) => Promise<void> {
	const wrapped = async (req: Request, res: Response): Promise<void> => {
		const uid = await verifyAuthToken(req, res);
		if (!uid) return;
		if (budget && !(await passesHttpRateLimit(req, res, budget, uid))) return;

		await handler(req, res, uid);
	};
	// index.ts logs handlers by name.
	Object.defineProperty(wrapped, 'name', { value: handler.name });

	return wrapped;
}

/** The parent question of an option, or undefined when `statement` has no such parent. */
async function loadParentQuestion(statement: Statement): Promise<Statement | undefined> {
	const { parentId, statementType } = statement;
	if (statementType !== StatementType.option || !parentId || parentId === TOP_PARENT_ID) {
		return undefined;
	}
	const parentSnap = await getFirestore().collection(Collections.statements).doc(parentId).get();

	return parentSnap.exists ? (parentSnap.data() as Statement) : undefined;
}

/**
 * Authorization for destructive or admin HTTP operations on a statement. Returns
 * the statement, or writes a 404/403 and returns null.
 *
 * Roles are read by subscription DOCUMENT id: a query on the fields would trust a
 * doc whose id names another statement.
 *
 * An option's author is an ordinary participant, so for an option the authority
 * comes from its parent question. Otherwise anyone could add an option and then
 * run admin operations on it.
 */
export async function requireStatementAdmin(
	res: Response,
	uid: string,
	statementId: string,
	operation: string,
): Promise<Statement | null> {
	try {
		const snap = await getFirestore().collection(Collections.statements).doc(statementId).get();
		if (!snap.exists) {
			res.status(404).json({ ok: false, error: 'Statement not found' });

			return null;
		}
		const statement = snap.data() as Statement;
		const authority = (await loadParentQuestion(statement)) ?? statement;

		if (await findStatementAdminSource(uid, authority)) return statement;

		res.status(403).json({ ok: false, error: 'Forbidden: statement admin required' });

		return null;
	} catch (error) {
		// Fail closed: a lookup error must never read as permission granted.
		logError(error, { operation, userId: uid, statementId });
		res.status(500).json({ ok: false, error: 'Internal Server Error' });

		return null;
	}
}

/**
 * Authorization for Sign document operations: the document's creator or a
 * collaborator who is not a viewer, matching checkAdminAccess in the Sign app.
 * Returns true, or writes a 404/403 and returns false.
 */
export async function requireSignDocumentEditor(
	res: Response,
	uid: string,
	documentId: string,
	operation: string,
): Promise<boolean> {
	try {
		const firestore = getFirestore();
		const snap = await firestore.collection(Collections.statements).doc(documentId).get();
		if (!snap.exists) {
			res.status(404).json({ ok: false, error: 'Document not found' });

			return false;
		}
		const document = snap.data() as Statement;
		if (document.creatorId === uid || document.creator?.uid === uid) return true;

		const collaborator = await firestore
			.collection(Collections.documentCollaborators)
			.doc(documentId)
			.collection('collaborators')
			.doc(uid)
			.get();
		const level = (collaborator.data() as Partial<DocumentCollaborator> | undefined)
			?.permissionLevel;
		if (collaborator.exists && level && level !== AdminPermissionLevel.viewer) return true;

		res.status(403).json({ ok: false, error: 'Forbidden: document editor required' });

		return false;
	} catch (error) {
		logError(error, { operation, userId: uid, statementId: documentId });
		res.status(500).json({ ok: false, error: 'Internal Server Error' });

		return false;
	}
}

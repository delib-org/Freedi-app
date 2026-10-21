import type { Firestore } from 'firebase-admin/firestore';
import { CallableRequest } from 'firebase-functions/v2/https';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	Role,
	StatementType,
	getStatementSubscriptionId,
} from '@freedi/shared-types';
import type { ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Shared guards and reads of the classroom callables. Every callable is
 * signed-in only; "admin" means an admin (or the creator) of the workspace
 * (`mainId`), the same test the rules' isAdmin() applies to subscriptions.
 */

const ADMIN_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator, 'creator']);
const MAX_ID_LENGTH = 200;

export function requireUid<T>(request: CallableRequest<T>): string {
	const uid = request.auth?.uid;
	if (!uid) throw new ClassroomError('unauthenticated', 'Sign in first');

	return uid;
}

/** A Firestore document id: non-empty string, no slash, bounded length. */
export function requireId(value: unknown, name: string): string {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > MAX_ID_LENGTH ||
		value.includes('/')
	) {
		throw new ClassroomError('invalid-argument', `${name} is required`);
	}

	return value;
}

export function subscriptionDocId(mainId: string, uid: string): string {
	return getStatementSubscriptionId(mainId, { uid, displayName: '' }) ?? `${uid}--${mainId}`;
}

export function subscriptionRef(db: Firestore, mainId: string, uid: string) {
	return db.collection(Collections.statementsSubscribe).doc(subscriptionDocId(mainId, uid));
}

export function tableRef(db: Firestore, tableId: string) {
	return db.collection(CLASS_TABLES_COLLECTION).doc(tableId);
}

export async function loadMain(db: Firestore, mainId: string): Promise<Statement> {
	const snap = await db.collection(Collections.statements).doc(mainId).get();
	if (!snap.exists) throw new ClassroomError('not-found', 'Lesson not found');

	return snap.data() as Statement;
}

export async function isWorkspaceAdmin(
	db: Firestore,
	mainId: string,
	uid: string,
	main?: Statement,
): Promise<boolean> {
	if (main && (main.creatorId === uid || main.creator?.uid === uid)) return true;
	const sub = await subscriptionRef(db, mainId, uid).get();
	const role = sub.exists ? (sub.data() as StatementSubscription).role : undefined;

	return typeof role === 'string' && ADMIN_ROLES.has(role);
}

/** Loads the workspace and refuses anyone who is not its admin. */
export async function assertWorkspaceAdmin(
	db: Firestore,
	mainId: string,
	uid: string,
): Promise<Statement> {
	const main = await loadMain(db, mainId);
	if (!(await isWorkspaceAdmin(db, mainId, uid, main))) {
		throw new ClassroomError('permission-denied', "Only the lesson's teacher can do this");
	}

	return main;
}

/** All table docs of a workspace, ordered by table number. */
export async function loadTables(db: Firestore, mainId: string): Promise<ClassTable[]> {
	const snap = await db.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId).get();

	return snap.docs.map((d) => d.data() as ClassTable).sort((x, y) => x.n - y.n);
}

/** True for a question directly under the workspace (guiding, the challenge, or a table's own question). */
export function isSubQuestionOf(statement: Statement | undefined, mainId: string): boolean {
	return (
		!!statement &&
		statement.parentId === mainId &&
		statement.statementType === StatementType.question &&
		statement.hide !== true
	);
}

/** The lesson's challenge question (classRole 'challenge'); the earliest one if a plan has several. */
export async function loadChallenge(db: Firestore, mainId: string): Promise<Statement> {
	const snap = await db.collection(Collections.statements).where('parentId', '==', mainId).get();
	const challenge = snap.docs
		.map((d) => d.data() as Statement)
		.filter((s) => isSubQuestionOf(s, mainId) && s.statementSettings?.classRole === 'challenge')
		.sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0))[0];
	if (!challenge)
		throw new ClassroomError('failed-precondition', 'The lesson has no challenge question');

	return challenge;
}

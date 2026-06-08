/**
 * Server-only admin subtree reads with a **visibility branch** (§3 read layer):
 *   - public / unlisted → read freely (admin bypasses rules; SSR serves HTML).
 *   - private           → verify `user.uid ∈ memberIds` first, else throw 403.
 *
 * Returns serializable `Statement[]` including the denormalized verdict /
 * aggregate fields. Visibility is enforced here in code because the admin SDK
 * bypasses `firestore.rules`.
 */
import { error } from '@sveltejs/kit';
import { Collections, Visibility } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { adminDb } from './firebaseAdmin';

const STATEMENTS = Collections.statements;

/** Don't let an unreachable/hung Firestore hang SSR — bound every admin read. */
const READ_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`Firestore read timed out: ${label}`)), READ_TIMEOUT_MS),
		),
	]);
}

export interface ConversationLoad {
	root: Statement;
	statements: Statement[];
}

/**
 * Deep-convert a Firestore admin doc into a SvelteKit-serializable POJO.
 * Firestore returns class instances for some types (Timestamp, VectorValue,
 * DocumentReference, GeoPoint) which `+page.server.ts` cannot serialize. We
 * convert Timestamps to millis and drop other non-POJO leaves (e.g. the
 * `embedding` VectorValue the AI pipeline writes — the chat UI never needs it).
 */
function serialize<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(serialize) as unknown as T;

	const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
	if (ctor && ctor !== 'Object') {
		const v = value as { toMillis?: () => number };
		if (typeof v.toMillis === 'function') return v.toMillis() as unknown as T;

		return undefined as unknown as T; // drop VectorValue / refs / etc.
	}

	const out: Record<string, unknown> = {};
	for (const [k, val] of Object.entries(value as Record<string, unknown>)) {
		const s = serialize(val);
		if (s !== undefined) out[k] = s;
	}

	return out as T;
}

function toStatement(data: unknown): Statement {
	return serialize(data) as Statement;
}

/** Fetch a single statement by id (or null). */
export async function getStatement(id: string): Promise<Statement | null> {
	const snap = await withTimeout(adminDb.collection(STATEMENTS).doc(id).get(), `get ${id}`);

	return snap.exists ? toStatement(snap.data()) : null;
}

/**
 * Load the full subtree under a root question for SSR. Enforces visibility.
 * `user` is the verified session user (or null for anonymous).
 */
export async function loadConversation(
	rootId: string,
	user: { uid: string } | null,
): Promise<ConversationLoad> {
	const root = await getStatement(rootId);
	if (!root) throw error(404, 'Question not found');

	assertCanRead(root, user);

	// All descendants share topParentId === root.statementId.
	const snap = await withTimeout(
		adminDb.collection(STATEMENTS).where('topParentId', '==', root.statementId).get(),
		'conversation subtree',
	);

	const statements = snap.docs.map((d) => toStatement(d.data()));
	// Ensure the root itself is present in the flat list.
	if (!statements.some((s) => s.statementId === root.statementId)) {
		statements.push(root);
	}

	return { root, statements };
}

export function assertCanRead(root: Statement, user: { uid: string } | null): void {
	const visibility = root.visibility ?? Visibility.public;
	if (visibility === Visibility.public || visibility === Visibility.unlisted) return;

	// private
	if (!user) throw error(401, 'Sign in to view this private conversation');
	const members = root.memberIds ?? [];
	if (!members.includes(user.uid)) throw error(403, 'You are not a member of this conversation');
}

/**
 * The signed-in user's own evaluations for a set of statements, keyed by
 * statementId → value. evaluationId = `uid--statementId` (one multi-get).
 */
export async function getMyEvaluations(
	uid: string,
	statementIds: string[],
): Promise<Record<string, number>> {
	if (statementIds.length === 0) return {};
	const refs = statementIds.map((id) =>
		adminDb.collection(Collections.evaluations).doc(`${uid}--${id}`),
	);
	const snaps = await withTimeout(adminDb.getAll(...refs), 'my evaluations');
	const out: Record<string, number> = {};
	for (const snap of snaps) {
		if (snap.exists) {
			const v = snap.data()?.evaluation;
			if (typeof v === 'number') out[snap.data()?.statementId as string] = v;
		}
	}

	return out;
}

/** Discovery query: latest public roots (§6 screen 1). */
export async function loadDiscovery(limit = 30): Promise<Statement[]> {
	const snap = await withTimeout(
		adminDb
			.collection(STATEMENTS)
			.where('isRoot', '==', true)
			.where('visibility', '==', Visibility.public)
			.orderBy('lastActivityAt', 'desc')
			.limit(limit)
			.get(),
		'discovery',
	);

	return snap.docs.map((d) => toStatement(d.data()));
}

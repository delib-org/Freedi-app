import type { Firestore } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';
import { isSystemAdmin } from './httpAuth';
import { ancestorIds } from './statementAncestors';
import {
	isActiveRole,
	isHostRole,
	isOpenAccess,
	judgeAccessLevels,
	type AccessLevel,
} from './statementAccess';

const TREE_ACCESS = {
	/** The same window as the bulk response cache, so nothing here is staler than the payload. */
	CACHE_TTL_MS: 30 * 1000,
	CACHE_MAX_ENTRIES: 200,
	/** Far deeper than any real tree. A longer `parents` list is refused, not read. */
	MAX_DEPTH: 100,
} as const;

const NOT_FOUND = 404;
const FORBIDDEN = 403;

type LevelSettings = AccessLevel['statement'];

/** The caller-independent half of the check: the root and each level above it. */
interface TreeChain {
	root: Statement;
	ids: string[];
	settings: LevelSettings[];
}

export type TreeReadAccess =
	| { allowed: true; seesEverything: boolean }
	| { allowed: false; status: number; error: string };

/** Statement id -> the private statement that governs it, below the root. */
export type PrivateGates = ReadonlyMap<string, string>;

const chainCache = new Map<string, { at: number; chain: Promise<TreeChain | null> }>();

function subscriptionRefs(firestore: Firestore, uid: string, statementIds: string[]) {
	const subscriptions = firestore.collection(Collections.statementsSubscribe);

	return statementIds.map((id) => subscriptions.doc(`${uid}--${id}`));
}

async function readChain(firestore: Firestore, rootId: string): Promise<TreeChain | null> {
	const statements = firestore.collection(Collections.statements);
	const rootSnap = await statements.doc(rootId).get();
	const root = rootSnap.data() as Statement | undefined;
	if (!rootSnap.exists || !root) return null;

	const ancestors = ancestorIds(root, Infinity);
	if (ancestors.length > TREE_ACCESS.MAX_DEPTH) return null;
	const snaps =
		ancestors.length > 0
			? await firestore.getAll(...ancestors.map((id) => statements.doc(id)))
			: [];

	return {
		root,
		ids: [rootId, ...ancestors],
		settings: [root, ...snaps.map((snap) => snap.data() as Statement | undefined)].map(
			(level) => level && { membership: level.membership, hide: level.hide },
		),
	};
}

/**
 * Only settings are cached, never a person's role: a ban or an approval takes
 * effect on the very next call. The promise is what is cached, so a burst on a
 * cold instance still pays for one read.
 */
function loadChain(firestore: Firestore, rootId: string): Promise<TreeChain | null> {
	const cached = chainCache.get(rootId);
	if (cached && Date.now() - cached.at <= TREE_ACCESS.CACHE_TTL_MS) return cached.chain;

	chainCache.delete(rootId);
	if (chainCache.size >= TREE_ACCESS.CACHE_MAX_ENTRIES) {
		const oldest = chainCache.keys().next().value;
		if (oldest !== undefined) chainCache.delete(oldest);
	}

	const chain = readChain(firestore, rootId);
	chainCache.set(rootId, { at: Date.now(), chain });
	chain.then(
		(found) => {
			if (!found) chainCache.delete(rootId);
		},
		() => chainCache.delete(rootId),
	);

	return chain;
}

/**
 * Whether the caller may read the tree under `rootId`. Follows the participation
 * gate (`judgeAccessLevels`), except that no access setting at any level means
 * open, and system admins pass. System-admin and statement-admin lookups run
 * only when the caller would otherwise be refused.
 */
export async function authorizeTreeRead(
	firestore: Firestore,
	uid: string,
	rootId: string,
): Promise<TreeReadAccess> {
	const chain = await loadChain(firestore, rootId);
	if (!chain) return { allowed: false, status: NOT_FOUND, error: 'Statement not found' };

	const roleSnaps = await firestore.getAll(...subscriptionRefs(firestore, uid, chain.ids));
	const levels: AccessLevel[] = chain.settings.map((statement, index) => ({
		statement,
		role: (roleSnaps[index].data() as { role?: string } | undefined)?.role,
	}));

	const verdict = judgeAccessLevels(levels, 'open');
	if (verdict === 'allowed') {
		return { allowed: true, seesEverything: levels.some(({ role }) => isHostRole(role)) };
	}
	if (await isSystemAdmin(uid)) return { allowed: true, seesEverything: true };
	if (verdict === 'banned') {
		return { allowed: false, status: FORBIDDEN, error: 'You cannot take part in this space' };
	}
	if ((await findStatementAdminSource(uid, chain.root)) !== null) {
		return { allowed: true, seesEverything: true };
	}
	if (verdict === 'hidden') {
		return { allowed: false, status: NOT_FOUND, error: 'Statement not found' };
	}
	if (verdict === 'waiting') {
		return { allowed: false, status: FORBIDDEN, error: 'Waiting for approval' };
	}

	return { allowed: false, status: FORBIDDEN, error: 'You are not a member of this space' };
}

/** The levels strictly between a statement and the root, nearest first. */
function levelsBelowRoot(statement: Statement, rootId: string): string[] {
	const parents = statement.parents ?? [];
	const rootIndex = parents.lastIndexOf(rootId);

	return rootIndex < 0 ? [] : parents.slice(rootIndex + 1).reverse();
}

/**
 * Which statements of a page sit behind a private level below the root. A level
 * at or above the root needs no entry: the caller has already passed it. The
 * result does not depend on the caller, so it is cached with the page.
 */
export async function findPrivateGates(
	firestore: Firestore,
	rootId: string,
	page: Statement[],
): Promise<PrivateGates> {
	const accessById = new Map(page.map((s) => [s.statementId, s.membership?.access]));
	const missing = new Set(
		page
			.filter((s) => !s.membership?.access)
			.flatMap((s) => levelsBelowRoot(s, rootId))
			.filter((id) => !accessById.has(id)),
	);
	if (missing.size > 0) {
		const statements = firestore.collection(Collections.statements);
		const ids = [...missing];
		const snaps = await firestore.getAll(...ids.map((id) => statements.doc(id)));
		snaps.forEach((snap, index) => {
			accessById.set(ids[index], (snap.data() as Statement | undefined)?.membership?.access);
		});
	}

	const gates = new Map<string, string>();
	for (const statement of page) {
		const owner = [statement.statementId, ...levelsBelowRoot(statement, rootId)].find((id) =>
			accessById.get(id),
		);
		const access = owner && accessById.get(owner);
		if (owner && access && !isOpenAccess(access)) gates.set(statement.statementId, owner);
	}

	return gates;
}

/** The gates this caller may not pass. Their roles are read fresh, one document per gate. */
export async function findRefusedGates(
	firestore: Firestore,
	uid: string,
	gates: PrivateGates,
): Promise<ReadonlySet<string>> {
	const gateIds = [...new Set(gates.values())];
	if (gateIds.length === 0) return new Set();

	const roleSnaps = await firestore.getAll(...subscriptionRefs(firestore, uid, gateIds));
	const refused = gateIds.filter(
		(_, index) => !isActiveRole((roleSnaps[index].data() as { role?: string } | undefined)?.role),
	);
	if (refused.length === 0 || (await isSystemAdmin(uid))) return new Set();

	return new Set(refused);
}

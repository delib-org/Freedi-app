import { documentId, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import {
	Access,
	Collections,
	OPEN_ACCESS_SCOPE,
	Role,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';
import { CACHE, FIREBASE } from '@/constants/common';
import { store } from '@/redux/store';
import { logError } from '@/utils/errorHandling';
import { createCollectionRef, createStatementRef } from '@/utils/firebaseUtils';

/**
 * Which `accessScope` values a list may filter on for this person, split into
 * the queries that have to run. Rules accept one restricted scope per query, so
 * the first query is open content plus the scope governing the statement, and
 * each private level further down gets its own query. Nearly always one query.
 */
export type ScopeChunks = string[][];

interface CachedTreeScopes {
	scopes: string[];
	roles: Map<string, Role>;
	at: number;
}

const MAX_TREE_SUBSCRIPTIONS = 200;

const isActiveRole = (role: Role | undefined): boolean =>
	role === Role.member || role === Role.admin || role === Role.creator;
const isHostRole = (role: Role | undefined): boolean =>
	role === Role.admin || role === Role.creator;

const treeScopesCache = new Map<string, CachedTreeScopes>();

/** Drop what is known about a tree, for when a role in it changes. */
export function forgetTreeScopes(): void {
	treeScopesCache.clear();
}

async function loadStatement(statementId: string): Promise<Statement | undefined> {
	const fromStore = store
		.getState()
		.statements.statements.find((statement) => statement.statementId === statementId);
	if (fromStore) return fromStore;

	const snapshot = await getDoc(createStatementRef(statementId));

	return snapshot.exists() ? (snapshot.data() as Statement) : undefined;
}

/** Levels in this tree where a host may read everything, found through the top. */
async function restrictedLevelsForHost(topParentId: string): Promise<string[]> {
	const snapshot = await getDocs(
		query(
			createCollectionRef(Collections.statements),
			where('topParentId', '==', topParentId),
			where('membership.access', 'in', [Access.moderated, Access.secret]),
		),
	);

	return snapshot.docs.map((doc) => doc.id);
}

/** Which of these subscribed levels are private levels of their own. */
async function restrictedLevels(ids: string[]): Promise<string[]> {
	const found: string[] = [];
	for (let start = 0; start < ids.length; start += FIREBASE.IN_QUERY_LIMIT) {
		const chunk = ids.slice(start, start + FIREBASE.IN_QUERY_LIMIT);
		const snapshot = await getDocs(
			query(createCollectionRef(Collections.statements), where(documentId(), 'in', chunk)),
		);
		snapshot.forEach((doc) => {
			if ((doc.data() as Statement).accessScope === doc.id) found.push(doc.id);
		});
	}

	return found;
}

async function loadTreeScopes(topParentId: string, uid: string): Promise<CachedTreeScopes> {
	const cached = treeScopesCache.get(topParentId);
	if (cached && Date.now() - cached.at < CACHE.SHORT_TTL) return cached;

	const subscriptions = await getDocs(
		query(
			createCollectionRef(Collections.statementsSubscribe),
			where('userId', '==', uid),
			where('topParentId', '==', topParentId),
			limit(MAX_TREE_SUBSCRIPTIONS),
		),
	);
	const roles = new Map<string, Role>();
	subscriptions.forEach((doc) => {
		const { statementId, role } = doc.data() as StatementSubscription;
		if (statementId && role) roles.set(statementId, role);
	});
	const topRole = roles.get(topParentId);
	const isHostOfTop =
		isHostRole(topRole) || store.getState().creator?.creator?.systemAdmin === true;
	const active = [...roles.entries()]
		.filter(([, role]) => isActiveRole(role))
		.map(([statementId]) => statementId);
	const scopes = isHostOfTop
		? await restrictedLevelsForHost(topParentId)
		: await restrictedLevels(active);
	const entry = { scopes, roles, at: Date.now() };
	treeScopesCache.set(topParentId, entry);

	return entry;
}

/**
 * The queries to run under a statement. A person with no way into its governing
 * level asks only for open content, so a public question in a private group
 * still loads and the rules have nothing to refuse.
 */
export async function scopeChunksOf(statementId: string): Promise<ScopeChunks> {
	const statement = await loadStatement(statementId);
	const governing = statement?.accessScope;
	const uid = store.getState().creator?.creator?.uid;
	if (!statement || !uid) return [[OPEN_ACCESS_SCOPE]];

	const topParentId = statement.topParentId || statementId;
	const { scopes, roles } = await loadTreeScopes(topParentId, uid).catch(
		(error: unknown): CachedTreeScopes => {
			logError(error, { operation: 'readScopes.loadTreeScopes', statementId, userId: uid });

			return { scopes: [], roles: new Map(), at: 0 };
		},
	);

	const isRestricted = Boolean(governing) && governing !== OPEN_ACCESS_SCOPE;
	const role = governing ? roles.get(governing) : undefined;
	const mayReadGoverning =
		isRestricted &&
		(isActiveRole(role) ||
			scopes.includes(governing as string) ||
			statement.creatorId === uid ||
			hasHostRoleAbove(statement, roles));
	const first =
		mayReadGoverning && governing ? [OPEN_ACCESS_SCOPE, governing] : [OPEN_ACCESS_SCOPE];
	const others = scopes.filter((scope) => scope !== governing).map((scope) => [scope]);

	return [first, ...others];
}

function hasHostRoleAbove(statement: Statement, roles: Map<string, Role>): boolean {
	return [...(statement.parents ?? []), statement.statementId].some((id) =>
		isHostRole(roles.get(id)),
	);
}

/** Starts one listener per scope chunk, once the chunks are known. */
export function listenInScopes(
	statementId: string,
	start: (scopes: string[]) => Unsubscribe,
): Unsubscribe {
	let cancelled = false;
	const stops: Unsubscribe[] = [];

	scopeChunksOf(statementId)
		.then((chunks) => {
			if (cancelled) return;
			chunks.forEach((scopes) => stops.push(start(scopes)));
		})
		.catch((error: unknown) => {
			logError(error, { operation: 'readScopes.listenInScopes', statementId });
		});

	return () => {
		cancelled = true;
		stops.forEach((stop) => stop());
	};
}

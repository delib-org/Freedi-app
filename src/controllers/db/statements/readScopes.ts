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

	// A copy on an answer is not a level of its own: it would mean one listener per answer.
	return snapshot.docs
		.filter((doc) => (doc.data() as Statement).accessScope === doc.id)
		.map((doc) => doc.id);
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

interface ReadPlan {
	chunks: ScopeChunks;
	/** A host or creator below the governing level: rules let them list children, not name it. */
	isHostBelow: boolean;
}

function levelIds(level: Statement): string[] {
	return [level.statementId, ...(level.parents ?? []), level.topParentId].filter(
		(id) => Boolean(id) && id !== 'top',
	);
}

/**
 * What may be asked for under a statement. A scope is named only when the rules
 * would accept it: a refused scope fails the whole query, open content included.
 */
async function readPlanOf(statementId: string): Promise<ReadPlan> {
	const statement = await loadStatement(statementId);
	const creator = store.getState().creator?.creator;
	const uid = creator?.uid;
	if (!statement || !uid) return { chunks: [[OPEN_ACCESS_SCOPE]], isHostBelow: false };

	const topParentId = statement.topParentId || statementId;
	const { scopes, roles } = await loadTreeScopes(topParentId, uid).catch(
		(error: unknown): CachedTreeScopes => {
			logError(error, { operation: 'readScopes.loadTreeScopes', statementId, userId: uid });

			return { scopes: [], roles: new Map(), at: 0 };
		},
	);
	const others = (governing: string | undefined) =>
		scopes
			.filter((scope) => scope !== governing && roles.get(scope) !== Role.banned)
			.map((scope) => [scope]);

	const governing = statement.accessScope;
	if (!governing || governing === OPEN_ACCESS_SCOPE) {
		return { chunks: [[OPEN_ACCESS_SCOPE], ...others(governing)], isHostBelow: false };
	}

	const level = governing === statementId ? statement : await loadStatement(governing);
	const aboveAndAt = level ? levelIds(level) : [governing];
	const statementLevels = levelIds(statement);
	const isBanned = [...aboveAndAt, ...statementLevels].some((id) => roles.get(id) === Role.banned);
	const mayReadGoverning =
		!isBanned &&
		(isActiveRole(roles.get(governing)) ||
			level?.creatorId === uid ||
			aboveAndAt.some((id) => isHostRole(roles.get(id))) ||
			creator?.systemAdmin === true);
	const isHostBelow =
		!isBanned &&
		!mayReadGoverning &&
		(statement.creatorId === uid || statementLevels.some((id) => isHostRole(roles.get(id))));
	const first = mayReadGoverning ? [OPEN_ACCESS_SCOPE, governing] : [OPEN_ACCESS_SCOPE];

	return { chunks: [first, ...others(governing)], isHostBelow };
}

/** The queries to run under a statement. Nearly always one. */
export async function scopeChunksOf(statementId: string): Promise<ScopeChunks> {
	return (await readPlanOf(statementId)).chunks;
}

/**
 * The scopes for a one-time list of a statement's children, or null when the
 * reader is a host below the governing level and the list needs no filter.
 */
export async function childListScopes(statementId: string): Promise<string[] | null> {
	const { chunks, isHostBelow } = await readPlanOf(statementId);

	return isHostBelow ? null : chunks[0];
}

/**
 * Starts one listener per scope chunk, once the chunks are known. `hostStart`
 * is the extra read a host below the governing level gets: an unscoped listener
 * for a list of children, or a one-time load for a whole tree.
 */
export function listenInScopes(
	statementId: string,
	start: (scopes: string[]) => Unsubscribe,
	hostStart?: () => Unsubscribe,
): Unsubscribe {
	let cancelled = false;
	const stops: Unsubscribe[] = [];

	readPlanOf(statementId)
		.then(({ chunks, isHostBelow }) => {
			if (cancelled) return;
			chunks.forEach((scopes) => stops.push(start(scopes)));
			if (isHostBelow && hostStart) stops.push(hostStart());
		})
		.catch((error: unknown) => {
			logError(error, { operation: 'readScopes.listenInScopes', statementId });
		});

	return () => {
		cancelled = true;
		stops.forEach((stop) => stop());
	};
}

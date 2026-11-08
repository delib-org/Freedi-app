import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
	getFirestore,
	type DocumentData,
	type Firestore,
	type Query,
} from 'firebase-admin/firestore';
import { safeParse } from 'valibot';
import {
	Access,
	Collections,
	Role,
	SEARCH_CONFIG,
	SearchStatementsRequestSchema,
	functionConfig,
	isSearchCandidate,
	isTopLevelSearchCandidate,
	normalizeSearchText,
	rankCandidates,
	statementToSearchCandidate,
	subscriptionToSearchCandidate,
	type SearchCandidate,
	type SearchMatch,
	type SearchStatementsRequest,
	type SearchStatementsResponse,
	type SearchableStatement,
	type SearchableSubscription,
	type Statement,
} from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from './config/cors';
import { treeScopeQuery } from './services/statement-tree-query';
import { vectorSearchService } from './services/vector-search-service';
import { logError } from './utils/errorHandling';

/**
 * Statement search for the main app.
 *
 *   home           the caller's top-level subscriptions
 *   subscriptions  every statement the caller is subscribed to
 *   tree           everything under one statement (lexical), plus
 *                  "similar meaning" hits from the stored vectors (semantic)
 *
 * The app ranks small candidate sets itself with the same scorer
 * (`rankCandidates` from shared-types); it calls this function for what it
 * cannot do locally — trees too big to download, subscriptions beyond what it
 * cached, and anything semantic (vectors are server-only).
 *
 * Access: the caller's uid comes from auth only, never from the request.
 * `/statements` is world-readable today (firestore.rules), so lexical tree
 * search reveals nothing a signed-in user could not read; the membership check
 * below still keeps search discovery to spaces the caller belongs to or that
 * are open, and it is the only gate in front of the vectors.
 */

const SERVER_SEARCH = {
	PAGE_SIZE: 500,
	/** Hard cap on statements scored per tree search (memory + latency). */
	MAX_TREE_SCAN: 20000,
	MAX_SUBSCRIPTION_SCAN: 10000,
} as const;

const TREE_FIELDS = [
	'statementId',
	'statement',
	'description',
	'statementType',
	'parentId',
	'topParentId',
	'lastUpdate',
	'createdAt',
	'hide',
] as const;

const SUBSCRIPTION_FIELDS = [
	'statementId',
	'role',
	'parentId',
	'topParentId',
	'statementType',
	'lastUpdate',
	'isDocument',
	'statement.statement',
	'statement.description',
	'statement.statementType',
	'statement.parentId',
	'statement.lastUpdate',
	'statement.createdAt',
] as const;

const OPEN_ACCESS: ReadonlySet<string> = new Set([
	Access.public,
	Access.open,
	Access.openToAll,
	Access.openForRegistered,
]);

const ACTIVE_ROLES: ReadonlySet<string> = new Set([Role.admin, Role.creator, Role.member]);

interface ScanResult {
	docs: DocumentData[];
	truncated: boolean;
}

interface TreeAccess {
	root: Statement;
	topParentId: string;
}

function emptyResponse(started: number): SearchStatementsResponse {
	return {
		lexical: [],
		semantic: [],
		coverage: { scanned: 0, total: 0 },
		durationMs: Date.now() - started,
	};
}

/** Read a query page by page (document-id order, index-free) up to `max` docs. */
async function scanPaged(base: Query, fields: readonly string[], max: number): Promise<ScanResult> {
	const docs: DocumentData[] = [];
	let cursor: string | null = null;

	while (docs.length < max) {
		const pageSize = Math.min(SERVER_SEARCH.PAGE_SIZE, max - docs.length);
		let page = base
			.select(...fields)
			.orderBy('__name__')
			.limit(pageSize);
		if (cursor) page = page.startAfter(cursor);

		const snapshot = await page.get();
		for (const doc of snapshot.docs) docs.push(doc.data());
		if (snapshot.docs.length < pageSize) return { docs, truncated: false };

		cursor = snapshot.docs[snapshot.docs.length - 1].id;
	}

	return { docs, truncated: true };
}

async function totalFor(base: Query, scan: ScanResult): Promise<number> {
	if (!scan.truncated) return scan.docs.length;

	const aggregate = await base.count().get();

	return aggregate.data().count;
}

/**
 * The caller may search a tree they hold an active role in (on the root or its
 * top statement), or one that is open. Banned is always refused.
 */
async function resolveTreeAccess(
	firestore: Firestore,
	uid: string,
	rootId: string,
): Promise<TreeAccess> {
	const statements = firestore.collection(Collections.statements);
	const rootSnap = await statements.doc(rootId).get();
	const root = rootSnap.data() as Statement | undefined;
	if (!rootSnap.exists || !root) {
		throw new HttpsError('not-found', 'Statement not found');
	}

	const topParentId = root.parentId === 'top' || !root.topParentId ? rootId : root.topParentId;
	const subscriptionIds = [...new Set([rootId, topParentId])];
	const subscriptions = await firestore.getAll(
		...subscriptionIds.map((id) =>
			firestore.collection(Collections.statementsSubscribe).doc(`${uid}--${id}`),
		),
	);
	const roles = subscriptions
		.filter((snap) => snap.exists)
		.map((snap) => (snap.data() as { role?: string } | undefined)?.role);

	if (roles.includes(Role.banned)) {
		throw new HttpsError('permission-denied', 'You cannot search this space');
	}
	if (roles.some((role) => role !== undefined && ACTIVE_ROLES.has(role))) {
		return { root, topParentId };
	}

	const top =
		topParentId === rootId
			? root
			: ((await statements.doc(topParentId).get()).data() as Statement | undefined);
	const access = root.membership?.access ?? top?.membership?.access;
	if (access && OPEN_ACCESS.has(access)) return { root, topParentId };

	throw new HttpsError('permission-denied', 'You are not a member of this space');
}

async function treeCandidates(
	firestore: Firestore,
	rootId: string,
	root: Statement,
): Promise<{ candidates: SearchCandidate[]; total: number }> {
	const base = treeScopeQuery(firestore, rootId, 'descendants');
	const scan = await scanPaged(base, TREE_FIELDS, SERVER_SEARCH.MAX_TREE_SCAN);
	const rootCandidate = statementToSearchCandidate(root as SearchableStatement);
	const candidates = scan.docs
		.map((doc) => statementToSearchCandidate(doc as SearchableStatement))
		.filter(isSearchCandidate);
	if (rootCandidate) candidates.unshift(rootCandidate);

	return { candidates, total: (await totalFor(base, scan)) + (rootCandidate ? 1 : 0) };
}

async function subscriptionCandidates(
	firestore: Firestore,
	uid: string,
	topLevelOnly: boolean,
): Promise<{ candidates: SearchCandidate[]; total: number }> {
	const base = firestore.collection(Collections.statementsSubscribe).where('userId', '==', uid);
	const scan = await scanPaged(base, SUBSCRIPTION_FIELDS, SERVER_SEARCH.MAX_SUBSCRIPTION_SCAN);
	const candidates = scan.docs
		.map((doc) => subscriptionToSearchCandidate(doc as SearchableSubscription))
		.filter(isSearchCandidate)
		.filter((candidate) => !topLevelOnly || isTopLevelSearchCandidate(candidate));

	return { candidates, total: topLevelOnly ? candidates.length : await totalFor(base, scan) };
}

/** Semantic hits never fail the search: without them the lexical results still stand. */
async function semanticInTree(
	uid: string,
	access: TreeAccess,
	rootId: string,
	query: string,
	limit: number,
): Promise<SearchMatch[]> {
	try {
		const hits = await vectorSearchService.findSimilarInTree(access.topParentId, query, {
			limit: SEARCH_CONFIG.SEMANTIC_LIMIT_PER_MODEL,
			threshold: SEARCH_CONFIG.MIN_SEMANTIC_SIMILARITY,
		});

		return hits
			.filter(
				({ statement }) => rootId === access.topParentId || statement.parents?.includes(rootId),
			)
			.map(({ statement, similarity }): SearchMatch | null => {
				const candidate = statementToSearchCandidate(statement as SearchableStatement);

				return candidate ? { candidate, score: similarity, kind: 'semantic' } : null;
			})
			.filter((match): match is SearchMatch => match !== null)
			.slice(0, limit);
	} catch (error) {
		logError(error, {
			operation: 'fn_searchStatements.semanticInTree',
			userId: uid,
			statementId: rootId,
		});

		return [];
	}
}

export async function executeStatementSearch(
	uid: string | undefined,
	data: unknown,
): Promise<SearchStatementsResponse> {
	const started = Date.now();
	if (!uid) {
		throw new HttpsError('unauthenticated', 'Sign in to search');
	}

	const parsed = safeParse(SearchStatementsRequestSchema, data);
	if (!parsed.success) {
		throw new HttpsError('invalid-argument', 'Invalid search request');
	}

	const request: SearchStatementsRequest = parsed.output;
	const query = request.query.trim();
	const limit = request.limit ?? SEARCH_CONFIG.MAX_RESULTS;
	if (normalizeSearchText(query).length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
		return emptyResponse(started);
	}

	const { scope } = request;
	const wantsLexical = request.lexical !== false;

	try {
		const firestore = getFirestore();

		if (scope.kind === 'tree') {
			const access = await resolveTreeAccess(firestore, uid, scope.rootId);
			const wantsSemantic =
				request.semantic === true && query.length >= SEARCH_CONFIG.MIN_SEMANTIC_QUERY_LENGTH;

			const [tree, semantic] = await Promise.all([
				wantsLexical ? treeCandidates(firestore, scope.rootId, access.root) : null,
				wantsSemantic ? semanticInTree(uid, access, scope.rootId, query, limit) : [],
			]);

			const lexical = tree ? rankCandidates(query, tree.candidates, { limit }) : [];
			const lexicalIds = new Set(lexical.map((match) => match.candidate.statementId));

			return {
				lexical,
				semantic: semantic.filter((match) => !lexicalIds.has(match.candidate.statementId)),
				coverage: { scanned: tree?.candidates.length ?? 0, total: tree?.total ?? 0 },
				durationMs: Date.now() - started,
			};
		}

		if (!wantsLexical) return emptyResponse(started);

		const { candidates, total } = await subscriptionCandidates(
			firestore,
			uid,
			scope.kind === 'home',
		);

		return {
			lexical: rankCandidates(query, candidates, { limit }),
			semantic: [],
			coverage: { scanned: candidates.length, total },
			durationMs: Date.now() - started,
		};
	} catch (error) {
		if (error instanceof HttpsError) throw error;

		logError(error, {
			operation: 'fn_searchStatements.executeStatementSearch',
			userId: uid,
			statementId: scope.kind === 'tree' ? scope.rootId : undefined,
			metadata: { scope: scope.kind, queryLength: query.length },
		});
		throw new HttpsError('internal', 'Search failed');
	}
}

export const searchStatements = onCall<SearchStatementsRequest>(
	{
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
		memory: '512MiB',
	},
	(request): Promise<SearchStatementsResponse> =>
		executeStatementSearch(request.auth?.uid, request.data),
);

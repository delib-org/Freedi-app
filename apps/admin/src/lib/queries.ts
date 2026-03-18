import {
	db,
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	orderBy,
	limit,
	getCountFromServer,
	startAfter,
} from './firebase';
import type { QueryDocumentSnapshot } from './firebase';
import { Collections, Statement, StatementType, Role } from '@freedi/shared-types';

// ── Time-series helpers ──────────────────────────────────────────────

export interface DayBucket {
	/** ISO date string YYYY-MM-DD */
	date: string;
	count: number;
}

/** Build an empty map of date→0 for every day in [startMs, endMs]. */
function emptyBuckets(startMs: number, endMs: number): Map<string, number> {
	const map = new Map<string, number>();
	const d = new Date(startMs);
	d.setHours(0, 0, 0, 0);
	const end = new Date(endMs);
	end.setHours(23, 59, 59, 999);
	while (d <= end) {
		map.set(d.toISOString().slice(0, 10), 0);
		d.setDate(d.getDate() + 1);
	}
	return map;
}

function bucketize(
	docs: Array<{ createdAt?: number; updatedAt?: number; lastUpdate?: number }>,
	startMs: number,
	endMs: number,
): DayBucket[] {
	const map = emptyBuckets(startMs, endMs);
	for (const d of docs) {
		const ts = d.createdAt ?? d.updatedAt ?? d.lastUpdate ?? 0;
		if (ts < startMs || ts > endMs) continue;
		const key = new Date(ts).toISOString().slice(0, 10);
		map.set(key, (map.get(key) || 0) + 1);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, count]) => ({ date, count }));
}

/**
 * Fetch documents from a collection within a date range using a timestamp field.
 * Returns raw doc data for client-side bucketing.
 */
async function fetchInRange(
	collectionName: string,
	timestampField: string,
	startMs: number,
	endMs: number,
	maxDocs: number = 5000,
): Promise<Record<string, unknown>[]> {
	const q = query(
		collection(db, collectionName),
		where(timestampField, '>=', startMs),
		where(timestampField, '<=', endMs),
		orderBy(timestampField, 'asc'),
		limit(maxDocs),
	);
	const snap = await getDocs(q);
	return snap.docs.map((d) => d.data() as Record<string, unknown>);
}

// ── Public time-series queries ───────────────────────────────────────

export async function fetchStatementsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.statements, 'createdAt', startMs, endMs);
	return bucketize(docs as Array<{ createdAt: number }>, startMs, endMs);
}

export interface StatementsByTypePerDay {
	type: string;
	data: DayBucket[];
}

export async function fetchStatementsByTypePerDay(days: number = 30): Promise<StatementsByTypePerDay[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.statements, 'createdAt', startMs, endMs);

	// Group by statementType
	const groups = new Map<string, Array<{ createdAt: number }>>();
	for (const d of docs) {
		const stmt = d as { createdAt: number; statementType?: string };
		const type = stmt.statementType || 'unknown';
		if (!groups.has(type)) groups.set(type, []);
		groups.get(type)!.push(stmt);
	}

	return Array.from(groups.entries()).map(([type, typeDocs]) => ({
		type,
		data: bucketize(typeDocs, startMs, endMs),
	}));
}

export async function fetchTopStatementsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const q = query(
		collection(db, Collections.statements),
		where('createdAt', '>=', startMs),
		where('createdAt', '<=', endMs),
		where('parentId', '==', 'top'),
		orderBy('createdAt', 'asc'),
		limit(5000),
	);
	const snap = await getDocs(q);
	const docs = snap.docs.map((d) => d.data() as { createdAt: number });
	return bucketize(docs, startMs, endMs);
}

export async function fetchEvaluationsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.evaluations, 'updatedAt', startMs, endMs);
	return bucketize(
		docs.map((d) => ({ createdAt: (d as { updatedAt: number }).updatedAt })),
		startMs,
		endMs,
	);
}

export async function fetchVotesPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.votes, 'createdAt', startMs, endMs);
	return bucketize(docs as Array<{ createdAt: number }>, startMs, endMs);
}

export async function fetchSubscriptionsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.statementsSubscribe, 'createdAt', startMs, endMs);
	return bucketize(docs as Array<{ createdAt: number }>, startMs, endMs);
}

export interface SourceAppPerDay {
	app: string;
	data: DayBucket[];
}

export async function fetchStatementsByAppPerDay(days: number = 30): Promise<SourceAppPerDay[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchInRange(Collections.statements, 'createdAt', startMs, endMs);

	const groups = new Map<string, Array<{ createdAt: number }>>();
	for (const d of docs) {
		const stmt = d as { createdAt: number; sourceApp?: string };
		const app = stmt.sourceApp || 'unknown';
		if (!groups.has(app)) groups.set(app, []);
		groups.get(app)!.push(stmt);
	}

	return Array.from(groups.entries()).map(([app, appDocs]) => ({
		app,
		data: bucketize(appDocs, startMs, endMs),
	}));
}

export interface StatementsFilter {
	statementType?: StatementType;
	searchText?: string;
}

export interface PaginatedResult<T> {
	items: T[];
	lastDoc: QueryDocumentSnapshot | null;
	hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

export async function fetchStatements(
	filters: StatementsFilter,
	cursor: QueryDocumentSnapshot | null,
	pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<Statement>> {
	const constraints = [];

	if (filters.statementType) {
		constraints.push(where('statementType', '==', filters.statementType));
	}

	constraints.push(orderBy('createdAt', 'desc'));

	if (cursor) {
		constraints.push(startAfter(cursor));
	}

	constraints.push(limit(pageSize + 1));

	const q = query(collection(db, Collections.statements), ...constraints);
	const snapshot = await getDocs(q);

	const hasMore = snapshot.docs.length > pageSize;
	const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

	return {
		items: docs.map((d) => d.data() as Statement),
		lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
		hasMore,
	};
}

export async function fetchStatementCount(): Promise<number> {
	const snap = await getCountFromServer(collection(db, Collections.statements));
	return snap.data().count;
}

export async function fetchStatementById(id: string): Promise<Statement | null> {
	const docSnap = await getDoc(doc(db, Collections.statements, id));
	return docSnap.exists() ? (docSnap.data() as Statement) : null;
}

export interface UserDoc {
	uid: string;
	displayName: string;
	email?: string | null;
	photoURL?: string | null;
	isAnonymous?: boolean;
	systemAdmin?: boolean;
}

export async function fetchUsers(
	cursor: QueryDocumentSnapshot | null,
	pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<UserDoc>> {
	const constraints = [];
	constraints.push(orderBy('displayName'));

	if (cursor) {
		constraints.push(startAfter(cursor));
	}

	constraints.push(limit(pageSize + 1));

	const q = query(collection(db, Collections.users), ...constraints);
	const snapshot = await getDocs(q);

	const hasMore = snapshot.docs.length > pageSize;
	const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

	return {
		items: docs.map((d) => ({ uid: d.id, ...d.data() } as UserDoc)),
		lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
		hasMore,
	};
}

export async function fetchUserCount(): Promise<number> {
	const snap = await getCountFromServer(collection(db, Collections.users));
	return snap.data().count;
}

export interface AdminSubscription {
	statementsSubscribeId: string;
	statementId: string;
	userId: string;
	role: string;
	statement?: { statement?: string };
	userDisplayName?: string;
}

export async function fetchAdminSubscriptions(): Promise<AdminSubscription[]> {
	const adminRoles: string[] = [Role.admin, Role.creator];
	const results: AdminSubscription[] = [];

	for (const role of adminRoles) {
		const q = query(
			collection(db, Collections.statementsSubscribe),
			where('role', '==', role)
		);
		const snapshot = await getDocs(q);

		for (const docSnap of snapshot.docs) {
			const data = docSnap.data();
			results.push({
				statementsSubscribeId: docSnap.id,
				statementId: data.statementId ?? '',
				userId: data.userId ?? '',
				role: data.role ?? '',
				statement: data.statement,
				userDisplayName: data.statement?.creatorId ?? data.userId,
			});
		}
	}

	return results;
}

export async function fetchEvaluationCount(): Promise<number> {
	const snap = await getCountFromServer(collection(db, Collections.evaluations));
	return snap.data().count;
}

export async function fetchVoteCount(): Promise<number> {
	const snap = await getCountFromServer(collection(db, Collections.votes));
	return snap.data().count;
}

export async function fetchSuggestionCount(): Promise<number> {
	const snap = await getCountFromServer(collection(db, Collections.suggestions));
	return snap.data().count;
}

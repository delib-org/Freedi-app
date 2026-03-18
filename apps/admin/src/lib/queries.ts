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

/**
 * Resolve a Firestore field value to milliseconds.
 * Handles: plain numbers, Firestore Timestamp objects, and Date objects.
 */
function toMillis(val: unknown): number {
	if (typeof val === 'number') return val;
	if (val && typeof val === 'object') {
		if ('toMillis' in val && typeof (val as Record<string, unknown>).toMillis === 'function') {
			return (val as { toMillis(): number }).toMillis();
		}
		if ('seconds' in val && typeof (val as Record<string, unknown>).seconds === 'number') {
			return (val as { seconds: number }).seconds * 1000;
		}
		if (val instanceof Date) return val.getTime();
	}
	return 0;
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
	timestamps: number[],
	startMs: number,
	endMs: number,
): DayBucket[] {
	const map = emptyBuckets(startMs, endMs);
	for (const ts of timestamps) {
		if (ts < startMs || ts > endMs) continue;
		const key = new Date(ts).toISOString().slice(0, 10);
		map.set(key, (map.get(key) || 0) + 1);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, count]) => ({ date, count }));
}

/**
 * Fetch recent documents from a collection, ordered by a timestamp field.
 * Uses orderBy + limit (no where range) to avoid Firestore Timestamp vs number
 * type mismatch issues. Filters to the date range client-side.
 */
async function fetchRecentDocs(
	collectionName: string,
	timestampField: string,
	startMs: number,
	maxDocs: number = 5000,
): Promise<Record<string, unknown>[]> {
	const q = query(
		collection(db, collectionName),
		orderBy(timestampField, 'desc'),
		limit(maxDocs),
	);
	const snap = await getDocs(q);
	return snap.docs
		.map((d) => d.data() as Record<string, unknown>)
		.filter((d) => toMillis(d[timestampField]) >= startMs);
}

// ── Public time-series queries ───────────────────────────────────────

export async function fetchStatementsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.statements, 'createdAt', startMs);
	const timestamps = docs.map((d) => toMillis(d.createdAt));
	return bucketize(timestamps, startMs, endMs);
}

export interface StatementsByTypePerDay {
	type: string;
	data: DayBucket[];
}

export async function fetchStatementsByTypePerDay(days: number = 30): Promise<StatementsByTypePerDay[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.statements, 'createdAt', startMs);

	const groups = new Map<string, number[]>();
	for (const d of docs) {
		const type = (d.statementType as string) || 'unknown';
		if (!groups.has(type)) groups.set(type, []);
		groups.get(type)!.push(toMillis(d.createdAt));
	}

	return Array.from(groups.entries()).map(([type, ts]) => ({
		type,
		data: bucketize(ts, startMs, endMs),
	}));
}

export async function fetchTopStatementsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	// Fetch recent statements and filter to top-level (parentId === 'top') client-side
	const docs = await fetchRecentDocs(Collections.statements, 'createdAt', startMs);
	const timestamps = docs
		.filter((d) => d.parentId === 'top')
		.map((d) => toMillis(d.createdAt));
	return bucketize(timestamps, startMs, endMs);
}

export async function fetchEvaluationsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.evaluations, 'updatedAt', startMs);
	const timestamps = docs.map((d) => toMillis(d.updatedAt));
	return bucketize(timestamps, startMs, endMs);
}

export async function fetchVotesPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.votes, 'createdAt', startMs);
	const timestamps = docs.map((d) => toMillis(d.createdAt));
	return bucketize(timestamps, startMs, endMs);
}

export async function fetchSubscriptionsPerDay(days: number = 30): Promise<DayBucket[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.statementsSubscribe, 'createdAt', startMs);
	const timestamps = docs.map((d) => toMillis(d.createdAt));
	return bucketize(timestamps, startMs, endMs);
}

export interface SourceAppPerDay {
	app: string;
	data: DayBucket[];
}

export async function fetchStatementsByAppPerDay(days: number = 30): Promise<SourceAppPerDay[]> {
	const endMs = Date.now();
	const startMs = endMs - days * 86_400_000;
	const docs = await fetchRecentDocs(Collections.statements, 'createdAt', startMs);

	const groups = new Map<string, number[]>();
	for (const d of docs) {
		const app = (d.sourceApp as string) || 'unknown';
		if (!groups.has(app)) groups.set(app, []);
		groups.get(app)!.push(toMillis(d.createdAt));
	}

	return Array.from(groups.entries()).map(([app, ts]) => ({
		app,
		data: bucketize(ts, startMs, endMs),
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

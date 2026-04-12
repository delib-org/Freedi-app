import m from 'mithril';
import { Collections, getResearchCategory } from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';
import { db, collection, query, orderBy, limit, onSnapshot } from '../lib/firebase';
import type { Unsubscribe } from 'firebase/firestore';

export type TimeScope = '1h' | '12h' | '24h' | '1w' | '1m';

export interface TimeBucket {
	/** Start timestamp of this bucket */
	time: number;
	/** Display label */
	label: string;
	logins: number;
	evaluations: number;
	votes: number;
	statements: number;
	proposals: number;
	screenViews: number;
}

export interface ResearchState {
	logs: ResearchLog[];
	totalActions: number;
	uniqueUsers: number;
	logins: number;
	evaluations: number;
	votes: number;
	statements: number;
	proposals: number;
	byApp: Map<string, number>;
	byAction: Map<string, number>;
	actionsPerMinute: number;
	lastActivityAt: number;
	loading: boolean;
	error: string | null;
	newLogIds: Set<string>;
	/** Time-bucketed series for the activity chart */
	timeSeries: TimeBucket[];
	/** Current time scope */
	timeScope: TimeScope;
}

const state: ResearchState = {
	logs: [],
	totalActions: 0,
	uniqueUsers: 0,
	logins: 0,
	evaluations: 0,
	votes: 0,
	statements: 0,
	proposals: 0,
	byApp: new Map(),
	byAction: new Map(),
	actionsPerMinute: 0,
	lastActivityAt: 0,
	loading: true,
	error: null,
	newLogIds: new Set(),
	timeSeries: [],
	timeScope: '24h',
};

let unsubscribe: Unsubscribe | null = null;
let knownIds = new Set<string>();
let isFirst = true;

function categorize(action: string) {
	return getResearchCategory(action);
}

// ── Time bucketing ──────────────────────────────────────────────────

const SCOPE_CONFIG: Record<TimeScope, { durationMs: number; bucketMs: number; labelFn: (d: Date) => string }> = {
	'1h':  { durationMs: 60 * 60 * 1000,          bucketMs: 2 * 60 * 1000,           labelFn: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}` },
	'12h': { durationMs: 12 * 60 * 60 * 1000,      bucketMs: 15 * 60 * 1000,          labelFn: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}` },
	'24h': { durationMs: 24 * 60 * 60 * 1000,      bucketMs: 30 * 60 * 1000,          labelFn: (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}` },
	'1w':  { durationMs: 7 * 24 * 60 * 60 * 1000,  bucketMs: 4 * 60 * 60 * 1000,      labelFn: (d) => `${d.getDate()}/${d.getMonth() + 1}` },
	'1m':  { durationMs: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000,     labelFn: (d) => `${d.getDate()}/${d.getMonth() + 1}` },
};

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function buildTimeSeries(logs: ResearchLog[], scope: TimeScope): TimeBucket[] {
	const config = SCOPE_CONFIG[scope];
	const now = Date.now();
	const start = now - config.durationMs;
	const bucketCount = Math.ceil(config.durationMs / config.bucketMs);

	// Create empty buckets
	const buckets: TimeBucket[] = [];
	for (let i = 0; i < bucketCount; i++) {
		const time = start + i * config.bucketMs;
		buckets.push({
			time,
			label: config.labelFn(new Date(time)),
			logins: 0,
			evaluations: 0,
			votes: 0,
			statements: 0,
			proposals: 0,
			screenViews: 0,
		});
	}

	// Fill buckets
	for (const log of logs) {
		if (log.timestamp < start) continue;
		const idx = Math.min(
			Math.floor((log.timestamp - start) / config.bucketMs),
			bucketCount - 1,
		);
		const cat = categorize(log.action);
		if (cat && buckets[idx]) {
			buckets[idx][cat]++;
		}
	}

	return buckets;
}

// ── Recompute ───────────────────────────────────────────────────────

function recompute(logs: ResearchLog[]): void {
	const users = new Set<string>();
	const byApp = new Map<string, number>();
	const byAction = new Map<string, number>();
	const newIds = new Set<string>();
	let logins = 0;
	let evaluations = 0;
	let votes = 0;
	let statements = 0;
	let proposals = 0;
	let lastActivity = 0;
	let recentCount = 0;
	const now = Date.now();

	for (const log of logs) {
		users.add(log.userId);

		const cat = categorize(log.action);
		if (cat === 'logins') logins++;
		else if (cat === 'evaluations') evaluations++;
		else if (cat === 'votes') votes++;
		else if (cat === 'statements') statements++;
		else if (cat === 'proposals') proposals++;

		const app = log.sourceApp || 'unknown';
		byApp.set(app, (byApp.get(app) || 0) + 1);
		byAction.set(log.action, (byAction.get(log.action) || 0) + 1);

		if (log.timestamp > lastActivity) lastActivity = log.timestamp;
		if (now - log.timestamp < 60_000) recentCount++;

		if (!isFirst && !knownIds.has(log.logId)) {
			newIds.add(log.logId);
		}
	}

	knownIds = new Set(logs.map((l) => l.logId));
	isFirst = false;

	state.logs = logs;
	state.totalActions = logs.length;
	state.uniqueUsers = users.size;
	state.logins = logins;
	state.evaluations = evaluations;
	state.votes = votes;
	state.statements = statements;
	state.proposals = proposals;
	state.byApp = byApp;
	state.byAction = byAction;
	state.actionsPerMinute = recentCount;
	state.lastActivityAt = lastActivity;
	state.newLogIds = newIds;
	state.timeSeries = buildTimeSeries(logs, state.timeScope);
	state.loading = false;
	state.error = null;
}

// ── Public API ──────────────────────────────────────────────────────

export function setTimeScope(scope: TimeScope): void {
	state.timeScope = scope;
	state.timeSeries = buildTimeSeries(state.logs, scope);
	m.redraw();
}

export function subscribeResearch(): void {
	if (unsubscribe) return;

	isFirst = true;
	knownIds = new Set();
	state.loading = true;

	const q = query(
		collection(db, Collections.researchLogs),
		orderBy('timestamp', 'asc'),
		limit(10000),
	);

	unsubscribe = onSnapshot(
		q,
		(snapshot) => {
			const logs: ResearchLog[] = [];
			snapshot.forEach((doc) => {
				logs.push(doc.data() as ResearchLog);
			});
			recompute(logs);
			m.redraw();
		},
		(err) => {
			console.error('[Research] Listener error:', err);
			state.error = 'Failed to load research logs';
			state.loading = false;
			m.redraw();
		},
	);
}

export function unsubscribeResearch(): void {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
}

export function getResearchState(): Readonly<ResearchState> {
	return state;
}

import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import {
	listenToRecent,
	listenToAdminSubscriptions,
	fetchStatementCount,
	fetchUserCount,
	fetchEvaluationCount,
	fetchVoteCount,
	toMillis,
	bucketize,
	DayBucket,
	StatementsByTypePerDay,
	SourceAppPerDay,
} from '../lib/queries';
import type { Unsubscribe } from '../lib/queries';
import { Collections } from '@freedi/shared-types';

interface DashboardState {
	totalStatements: number;
	totalUsers: number;
	totalAdmins: number;
	totalEvaluations: number;
	totalVotes: number;
	recentStatements: Statement[];
	typeBreakdown: Map<string, number>;

	statementsPerDay: DayBucket[];
	topStatementsPerDay: DayBucket[];
	evaluationsPerDay: DayBucket[];
	votesPerDay: DayBucket[];
	newUsersPerDay: DayBucket[];
	statementsByType: StatementsByTypePerDay[];
	statementsByApp: SourceAppPerDay[];

	loading: boolean;
	chartsLoading: boolean;
	error: string | null;
}

const state: DashboardState = {
	totalStatements: 0,
	totalUsers: 0,
	totalAdmins: 0,
	totalEvaluations: 0,
	totalVotes: 0,
	recentStatements: [],
	typeBreakdown: new Map(),

	statementsPerDay: [],
	topStatementsPerDay: [],
	evaluationsPerDay: [],
	votesPerDay: [],
	newUsersPerDay: [],
	statementsByType: [],
	statementsByApp: [],

	loading: true,
	chartsLoading: true,
	error: null,
};

const DAYS = 30;
const MAX_CHART_DOCS = 5000;
let unsubs: Unsubscribe[] = [];

function getRange(): { startMs: number; endMs: number } {
	const endMs = Date.now();
	return { startMs: endMs - DAYS * 86_400_000, endMs };
}

/** Process raw statement docs into all chart data. */
function processStatements(docs: Record<string, unknown>[]): void {
	const { startMs, endMs } = getRange();

	// Filter to range
	const inRange = docs.filter((d) => toMillis(d.createdAt) >= startMs);

	// Statements per day
	const allTs = inRange.map((d) => toMillis(d.createdAt));
	state.statementsPerDay = bucketize(allTs, startMs, endMs);

	// Top statements per day
	const topTs = inRange
		.filter((d) => d.parentId === 'top')
		.map((d) => toMillis(d.createdAt));
	state.topStatementsPerDay = bucketize(topTs, startMs, endMs);

	// By type
	const typeGroups = new Map<string, number[]>();
	for (const d of inRange) {
		const type = (d.statementType as string) || 'unknown';
		if (!typeGroups.has(type)) typeGroups.set(type, []);
		typeGroups.get(type)!.push(toMillis(d.createdAt));
	}
	state.statementsByType = Array.from(typeGroups.entries()).map(([type, ts]) => ({
		type,
		data: bucketize(ts, startMs, endMs),
	}));

	// By app
	const appGroups = new Map<string, number[]>();
	for (const d of inRange) {
		const app = (d.sourceApp as string) || 'unknown';
		if (!appGroups.has(app)) appGroups.set(app, []);
		appGroups.get(app)!.push(toMillis(d.createdAt));
	}
	state.statementsByApp = Array.from(appGroups.entries()).map(([app, ts]) => ({
		app,
		data: bucketize(ts, startMs, endMs),
	}));

	// Recent + type breakdown (from first 10)
	const recent = inRange
		.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
		.slice(0, 10);
	state.recentStatements = recent as unknown as Statement[];

	const breakdown = new Map<string, number>();
	for (const stmt of recent) {
		const type = (stmt.statementType as string) || 'unknown';
		breakdown.set(type, (breakdown.get(type) || 0) + 1);
	}
	state.typeBreakdown = breakdown;

	state.chartsLoading = false;
}

export function subscribeDashboard(): void {
	state.loading = true;
	state.chartsLoading = true;
	state.error = null;
	m.redraw();

	// Fetch counts once, then periodically (no real-time count API)
	loadCounts();

	// Real-time: statements
	unsubs.push(
		listenToRecent(Collections.statements, 'createdAt', MAX_CHART_DOCS, (snap) => {
			const docs = snap.docs.map((d) => d.data() as Record<string, unknown>);
			processStatements(docs);
			state.loading = false;
			m.redraw();
		})
	);

	// Real-time: evaluations
	unsubs.push(
		listenToRecent(Collections.evaluations, 'updatedAt', MAX_CHART_DOCS, (snap) => {
			const { startMs, endMs } = getRange();
			const ts = snap.docs
				.map((d) => toMillis(d.data().updatedAt))
				.filter((t) => t >= startMs);
			state.evaluationsPerDay = bucketize(ts, startMs, endMs);
			m.redraw();
		})
	);

	// Real-time: votes
	unsubs.push(
		listenToRecent(Collections.votes, 'createdAt', MAX_CHART_DOCS, (snap) => {
			const { startMs, endMs } = getRange();
			const ts = snap.docs
				.map((d) => toMillis(d.data().createdAt))
				.filter((t) => t >= startMs);
			state.votesPerDay = bucketize(ts, startMs, endMs);
			m.redraw();
		})
	);

	// Real-time: subscriptions (proxy for new users)
	unsubs.push(
		listenToRecent(Collections.statementsSubscribe, 'createdAt', MAX_CHART_DOCS, (snap) => {
			const { startMs, endMs } = getRange();
			const ts = snap.docs
				.map((d) => toMillis(d.data().createdAt))
				.filter((t) => t >= startMs);
			state.newUsersPerDay = bucketize(ts, startMs, endMs);
			m.redraw();
		})
	);

	// Real-time: admin subscriptions
	const adminUnsubs = listenToAdminSubscriptions((snap) => {
		const userIds = new Set<string>();
		for (const d of snap.docs) {
			const data = d.data();
			if (data.userId) userIds.add(data.userId as string);
		}
		state.totalAdmins = userIds.size;
		m.redraw();
	});
	unsubs.push(...adminUnsubs);
}

async function loadCounts(): Promise<void> {
	try {
		const [stmtCount, userCount, evalCount, voteCount] = await Promise.all([
			fetchStatementCount(),
			fetchUserCount(),
			fetchEvaluationCount(),
			fetchVoteCount(),
		]);
		state.totalStatements = stmtCount;
		state.totalUsers = userCount;
		state.totalEvaluations = evalCount;
		state.totalVotes = voteCount;
		m.redraw();
	} catch (error) {
		console.error('[Dashboard] Failed to load counts:', error);
	}
}

export function unsubscribeDashboard(): void {
	for (const unsub of unsubs) unsub();
	unsubs = [];
}

export function getDashboardState(): Readonly<DashboardState> {
	return state;
}

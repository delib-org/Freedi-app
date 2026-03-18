import m from 'mithril';
import { Statement, StatementType } from '@freedi/shared-types';
import {
	fetchStatementCount,
	fetchUserCount,
	fetchEvaluationCount,
	fetchVoteCount,
	fetchStatements,
	fetchAdminSubscriptions,
	fetchStatementsPerDay,
	fetchTopStatementsPerDay,
	fetchEvaluationsPerDay,
	fetchVotesPerDay,
	fetchSubscriptionsPerDay,
	fetchStatementsByTypePerDay,
	fetchStatementsByAppPerDay,
	DayBucket,
	StatementsByTypePerDay,
	SourceAppPerDay,
} from '../lib/queries';

interface DashboardState {
	// KPIs
	totalStatements: number;
	totalUsers: number;
	totalAdmins: number;
	totalEvaluations: number;
	totalVotes: number;
	recentStatements: Statement[];
	typeBreakdown: Map<string, number>;

	// Time-series
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

export async function loadDashboardData(): Promise<void> {
	state.loading = true;
	state.error = null;
	m.redraw();

	try {
		const [
			stmtCount,
			userCount,
			evalCount,
			voteCount,
			recentResult,
			adminSubs,
		] = await Promise.all([
			fetchStatementCount(),
			fetchUserCount(),
			fetchEvaluationCount(),
			fetchVoteCount(),
			fetchStatements({}, null, 10),
			fetchAdminSubscriptions(),
		]);

		state.totalStatements = stmtCount;
		state.totalUsers = userCount;
		state.totalEvaluations = evalCount;
		state.totalVotes = voteCount;
		state.recentStatements = recentResult.items;

		const uniqueAdmins = new Set(adminSubs.map((s) => s.userId));
		state.totalAdmins = uniqueAdmins.size;

		const breakdown = new Map<string, number>();
		for (const stmt of recentResult.items) {
			const type = stmt.statementType || 'unknown';
			breakdown.set(type, (breakdown.get(type) || 0) + 1);
		}
		state.typeBreakdown = breakdown;

		state.loading = false;
		m.redraw();

		// Load charts in parallel (non-blocking after KPIs render)
		await loadChartData();
	} catch (error) {
		console.error('[Dashboard] Failed to load data:', error);
		state.error = 'Failed to load dashboard data';
		state.loading = false;
		m.redraw();
	}
}

async function loadChartData(): Promise<void> {
	state.chartsLoading = true;
	m.redraw();

	try {
		const [
			stmtsPerDay,
			topPerDay,
			evalsPerDay,
			votesDay,
			subsPerDay,
			byType,
			byApp,
		] = await Promise.all([
			fetchStatementsPerDay(30),
			fetchTopStatementsPerDay(30),
			fetchEvaluationsPerDay(30),
			fetchVotesPerDay(30),
			fetchSubscriptionsPerDay(30),
			fetchStatementsByTypePerDay(30),
			fetchStatementsByAppPerDay(30),
		]);

		state.statementsPerDay = stmtsPerDay;
		state.topStatementsPerDay = topPerDay;
		state.evaluationsPerDay = evalsPerDay;
		state.votesPerDay = votesDay;
		state.newUsersPerDay = subsPerDay;
		state.statementsByType = byType;
		state.statementsByApp = byApp;
	} catch (error) {
		console.error('[Dashboard] Failed to load chart data:', error);
	}

	state.chartsLoading = false;
	m.redraw();
}

export function getDashboardState(): Readonly<DashboardState> {
	return state;
}

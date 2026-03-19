import m from 'mithril';
import { Statement, StatementType } from '@freedi/shared-types';
import { Layout } from '../components/Layout';
import { KpiCard } from '../components/KpiCard';
import { MiniChart, ChartItem } from '../components/MiniChart';
import { DataTable, ColumnConfig } from '../components/DataTable';
import { Spinner } from '../components/Spinner';
import { TimeChart, MultiTimeChart, MultiSeriesItem } from '../components/TimeChart';
import { statementTypeBadge, sourceAppBadge } from '../components/Badge';
import { PeriodToggle } from '../components/PeriodToggle';
import { subscribeDashboard, unsubscribeDashboard, getDashboardState, setPeriodMode } from '../state/dashboard';

// ── Color maps ───────────────────────────────────────────────────────

const chartColors: Record<string, string> = {
	[StatementType.statement]: '#0EA5E9',
	[StatementType.option]: '#10B981',
	[StatementType.question]: '#6366F1',
	[StatementType.document]: '#EC4899',
	[StatementType.group]: '#F97316',
	[StatementType.comment]: '#06B6D4',
	[StatementType.paragraph]: '#84CC16',
	unknown: '#94A3B8',
};

const appColors: Record<string, string> = {
	main: '#3B82F6',
	sign: '#8B5CF6',
	'mass-consensus': '#14B8A6',
	flow: '#F59E0B',
	unknown: '#94A3B8',
};

// ── Subtitle helpers ─────────────────────────────────────────────────

function getSubtitle(mode: string): string {
	switch (mode) {
		case 'monthly': return 'System-wide analytics \u2014 last 12 months';
		case 'yearly': return 'System-wide analytics \u2014 last 5 years';
		default: return 'System-wide analytics \u2014 last 30 days';
	}
}

function getPeriodLabel(mode: string): string {
	switch (mode) {
		case 'monthly': return 'Month';
		case 'yearly': return 'Year';
		default: return 'Day';
	}
}

// ── Recent statements table config ───────────────────────────────────

const recentColumns: ColumnConfig<Statement>[] = [
	{
		key: 'statement',
		label: 'Statement',
		render: (s) =>
			s.statement.length > 80
				? s.statement.substring(0, 77) + '...'
				: s.statement,
		width: '50%',
	},
	{
		key: 'type',
		label: 'Type',
		render: (s) => statementTypeBadge(s.statementType),
		width: '100px',
	},
	{
		key: 'sourceApp',
		label: 'App',
		render: (s) =>
			sourceAppBadge((s as Statement & { sourceApp?: string }).sourceApp),
		width: '120px',
	},
	{
		key: 'creator',
		label: 'Creator',
		render: (s) => s.creator?.displayName || 'Unknown',
		width: '150px',
	},
	{
		key: 'date',
		label: 'Created',
		render: (s) => new Date(s.createdAt).toLocaleDateString(),
		width: '100px',
	},
];

const RecentTable = DataTable<Statement>();

// ── View ─────────────────────────────────────────────────────────────

export function DashboardView(): m.Component {
	return {
		oninit() {
			subscribeDashboard();
		},

		onremove() {
			unsubscribeDashboard();
		},

		view() {
			const state = getDashboardState();
			const periodLabel = getPeriodLabel(state.periodMode);

			if (state.loading) {
				return m(Layout, m(Spinner));
			}

			return m(Layout, [
				m('.page-header', [
					m('.page-header__row', [
						m('div', [
							m('h1.page-header__title', 'Dashboard'),
							m('p.page-header__subtitle', getSubtitle(state.periodMode)),
						]),
						m(PeriodToggle, {
							value: state.periodMode,
							onChange: setPeriodMode,
						}),
					]),
				]),

				// KPI Cards
				m('.kpi-row', [
					m(KpiCard, {
						title: 'Statements',
						value: state.totalStatements,
						icon: '\u{1F4DD}',
						gradient: 'blue',
						trend: state.statementsTrend || undefined,
					}),
					m(KpiCard, {
						title: 'Users',
						value: state.totalUsers,
						icon: '\u{1F465}',
						gradient: 'teal',
						trend: state.usersTrend || undefined,
					}),
					m(KpiCard, {
						title: 'Admins',
						value: state.totalAdmins,
						icon: '\u{1F6E1}',
						gradient: 'violet',
					}),
					m(KpiCard, {
						title: 'Evaluations',
						value: state.totalEvaluations,
						icon: '\u{2B50}',
						gradient: 'rose',
						trend: state.evaluationsTrend || undefined,
					}),
					m(KpiCard, {
						title: 'Votes',
						value: state.totalVotes,
						icon: '\u{1F4CA}',
						gradient: 'amber',
						trend: state.votesTrend || undefined,
					}),
				]),

				// Activity Charts
				m('.section-title', `Activity Over Time`),

				state.chartsLoading
					? m(Spinner, { inline: true })
					: m('div', [
							m('.grid-3', [
								m(TimeChart, {
									title: `Statements / ${periodLabel}`,
									data: state.statementsPerDay,
									color: '#3B82F6',
									variant: 'area',
									height: 180,
								}),
								m(TimeChart, {
									title: `Evaluations / ${periodLabel}`,
									data: state.evaluationsPerDay,
									color: '#F43F5E',
									variant: 'area',
									height: 180,
								}),
								m(TimeChart, {
									title: `Votes / ${periodLabel}`,
									data: state.votesPerDay,
									color: '#F59E0B',
									variant: 'bar',
									height: 180,
								}),
							]),

							m('.grid-3', [
								m(TimeChart, {
									title: `New Discussions / ${periodLabel}`,
									data: state.topStatementsPerDay,
									color: '#8B5CF6',
									variant: 'bar',
									height: 180,
								}),
								m(TimeChart, {
									title: `New User Subscriptions / ${periodLabel}`,
									data: state.newUsersPerDay,
									color: '#14B8A6',
									variant: 'area',
									height: 180,
								}),
								m(MiniChart, {
									title: 'Statement Types (Recent)',
									items: Array.from(
										state.typeBreakdown.entries()
									).map(
										([label, value]): ChartItem => ({
											label,
											value,
											color: chartColors[label] || '#94A3B8',
										})
									),
								}),
							]),

							m('.grid-2', [
								m(MultiTimeChart, {
									title: `Statements by Type / ${periodLabel}`,
									series: state.statementsByType.map(
										(s): MultiSeriesItem => ({
											label: s.type,
											data: s.data,
											color: chartColors[s.type] || '#94A3B8',
										})
									),
									height: 200,
								}),
								m(MultiTimeChart, {
									title: `Statements by App / ${periodLabel}`,
									series: state.statementsByApp.map(
										(s): MultiSeriesItem => ({
											label: s.app,
											data: s.data,
											color: appColors[s.app] || '#94A3B8',
										})
									),
									height: 200,
								}),
							]),
						]),

				// Recent Statements (only show in daily mode)
				state.periodMode === 'daily'
					? [
						m('.section-title', 'Recent Statements'),
						m(RecentTable, {
							columns: recentColumns,
							data: state.recentStatements,
							emptyMessage: 'No statements yet',
						}),
					]
					: null,

				state.error ? m('.data-table__empty', state.error) : null,
			]);
		},
	};
}

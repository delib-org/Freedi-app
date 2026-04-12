import m from 'mithril';
import { Layout } from '../components/Layout';
import { KpiCard } from '../components/KpiCard';
import { Spinner } from '../components/Spinner';
import { subscribeResearch, unsubscribeResearch, getResearchState } from '../state/research';
import { ResearchChart } from '../components/ResearchChart';
import { getResearchActionLabel, normalizeScreenPath } from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';

// ── Constants ────────────────────────────────────────────────────────

const APP_COLORS: Record<string, string> = {
	main: '#3B82F6',
	'mass-consensus': '#14B8A6',
	sign: '#8B5CF6',
	unknown: '#94A3B8',
};

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
	const diff = Date.now() - ts;
	const sec = Math.floor(diff / 1000);
	if (sec < 10) return 'just now';
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;

	return `${Math.floor(hr / 24)}d ago`;
}

// ── Sub-components ───────────────────────────────────────────────────

function PulseDot(active: boolean): m.Vnode {
	return m('span.research__pulse', { class: active ? 'research__pulse--active' : '' });
}

function AppBar(app: string, count: number, total: number): m.Vnode {
	const pct = total > 0 ? (count / total) * 100 : 0;
	const color = APP_COLORS[app] || APP_COLORS.unknown;

	return m('.research__app-row', [
		m('span.research__app-dot', { style: { background: color } }),
		m('span.research__app-name', app),
		m('.research__app-track', [
			m('.research__app-fill', { style: { width: `${pct}%`, background: color } }),
		]),
		m('span.research__app-count', count.toLocaleString()),
	]);
}

function ActivityRow(log: ResearchLog, isNew: boolean): m.Vnode {
	const color = APP_COLORS[log.sourceApp || 'main'] || APP_COLORS.unknown;

	return m('.research__row', { class: isNew ? 'research__row--new' : '' }, [
		m('span.research__row-dot', { style: { background: color } }),
		m('span.research__row-action', getResearchActionLabel(log.action)),
		log.newValue ? m('span.research__row-value', log.newValue) : null,
		m('span.research__row-app', log.sourceApp || 'main'),
		m('span.research__row-time', timeAgo(log.timestamp)),
	]);
}

// ── Ticker (refreshes timeAgo labels) ────────────────────────────────

let tickerInterval: ReturnType<typeof setInterval> | null = null;

function startTicker(): void {
	if (tickerInterval) return;
	tickerInterval = setInterval(() => m.redraw(), 10_000);
}

function stopTicker(): void {
	if (tickerInterval) {
		clearInterval(tickerInterval);
		tickerInterval = null;
	}
}

// ── View ─────────────────────────────────────────────────────────────

export function ResearchView(): m.Component {
	return {
		oninit() {
			subscribeResearch();
			startTicker();
		},

		onremove() {
			unsubscribeResearch();
			stopTicker();
		},

		view() {
			const s = getResearchState();

			if (s.loading) {
				return m(Layout, m(Spinner));
			}

			const isLive = Date.now() - s.lastActivityAt < 120_000;
			const recent = s.logs.slice(-80).reverse();

			return m(Layout, [
				// Header
				m('.page-header', [
					m('.page-header__row', [
						m('div', [
							m('h1.page-header__title', 'Research Dashboard'),
							m('p.page-header__subtitle', [
								PulseDot(isLive),
								isLive ? ' Live \u2014 real-time research telemetry' : ' Inactive \u2014 no recent activity',
							]),
						]),
						m(
							'button.research__export-btn',
							{
								disabled: s.totalActions === 0,
								onclick: () => exportJSON(s.logs),
							},
							'\u2B07 Export JSON',
						),
					]),
				]),

				// KPI Row
				m('.kpi-row', [
					m(KpiCard, {
						title: 'Unique Users',
						value: s.uniqueUsers,
						icon: '\u{1F465}',
						gradient: 'blue',
					}),
					m(KpiCard, {
						title: 'Total Actions',
						value: s.totalActions,
						icon: '\u{26A1}',
						gradient: 'teal',
					}),
					m(KpiCard, {
						title: 'Evaluations',
						value: s.evaluations,
						icon: '\u{2B50}',
						gradient: 'amber',
					}),
					m(KpiCard, {
						title: 'Votes',
						value: s.votes,
						icon: '\u{1F4CA}',
						gradient: 'violet',
					}),
					m(KpiCard, {
						title: 'Statements',
						value: s.statements,
						icon: '\u{1F4DD}',
						gradient: 'rose',
					}),
					m(KpiCard, {
						title: 'Logins',
						value: s.logins,
						icon: '\u{1F511}',
						gradient: 'blue',
					}),
				]),

				// Activity Timeline Chart
				m(ResearchChart, {
					data: s.timeSeries,
					scope: s.timeScope,
				}),

				// Rate + App Breakdown
				m('.grid-2', [
					// Actions per minute
					m('.research__panel', [
						m('.section-title', 'Activity Rate'),
						m('.research__rate', [
							m('.research__rate-value', s.actionsPerMinute.toLocaleString()),
							m('.research__rate-label', 'actions / min'),
						]),
					]),

					// App breakdown
					m('.research__panel', [
						m('.section-title', 'By App'),
						s.byApp.size === 0
							? m('.research__empty', 'No data yet')
							: Array.from(s.byApp.entries()).map(([app, count]) =>
								AppBar(app, count, s.totalActions),
							),
					]),
				]),

				// Action breakdown
				m('.research__panel', [
					m('.section-title', 'By Action Type'),
					s.byAction.size === 0
						? m('.research__empty', 'No data yet')
						: m('.research__action-grid',
							Array.from(s.byAction.entries())
								.sort((a, b) => b[1] - a[1])
								.map(([action, count]) =>
									m('.research__action-chip', [
										m('span.research__action-label', getResearchActionLabel(action)),
										m('span.research__action-count', count.toLocaleString()),
									]),
								),
						),
				]),

				// Live Feed
				m('.research__panel', [
					m('.section-title', [
						'Live Activity ',
						m('span.research__feed-count', `${recent.length} recent`),
					]),
					m(
						'.research__feed',
						recent.length === 0
							? m('.research__empty', 'Waiting for actions\u2026')
							: recent.map((log) =>
								ActivityRow(log, s.newLogIds.has(log.logId)),
							),
					),
				]),

				s.error ? m('.data-table__empty', s.error) : null,
			]);
		},
	};
}

// ── Export ────────────────────────────────────────────────────────────

function exportJSON(logs: ResearchLog[]): void {
	// Pseudonymize before export
	const userIdMap = new Map<string, string>();
	let counter = 1;

	const anonymized = logs.map((log) => {
		if (!userIdMap.has(log.userId)) {
			userIdMap.set(log.userId, `participant_${counter++}`);
		}
		const pseudoId = userIdMap.get(log.userId)!;

		return {
			...log,
			userId: pseudoId,
			logId: `${pseudoId}_${log.timestamp}`,
			screen: log.screen ? normalizeScreenPath(log.screen) : undefined,
			loginCount: undefined,
		};
	});

	const blob = new Blob([JSON.stringify(anonymized, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `research-logs_${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

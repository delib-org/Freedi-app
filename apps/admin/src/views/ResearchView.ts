import m from 'mithril';
import { Layout } from '../components/Layout';
import { KpiCard } from '../components/KpiCard';
import { Spinner } from '../components/Spinner';
import { subscribeResearch, unsubscribeResearch, getResearchState } from '../state/research';
import { ResearchChart } from '../components/ResearchChart';
import { getResearchActionLabel, normalizeScreenPath } from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';
import { setResearchLogging, getResearchLoggingStatus } from '../lib/queries';

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

// ── Research Config Panel ────────────────────────────────────────────

interface ConfigEntry {
	statementId: string;
	title: string;
	enabled: boolean;
}

const STORAGE_KEY = 'freedi_research_config_entries';

function loadPersistedEntries(): ConfigEntry[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as ConfigEntry[];
	} catch { /* ignore */ }

	return [];
}

function persistEntries(entries: ConfigEntry[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch { /* ignore */ }
}

const configState = {
	inputId: '',
	entries: loadPersistedEntries(),
	loading: false,
	error: null as string | null,
	success: null as string | null,
};

async function handleLookup(): Promise<void> {
	const id = configState.inputId.trim();
	if (!id) return;

	configState.loading = true;
	configState.error = null;
	configState.success = null;
	m.redraw();

	try {
		const result = await getResearchLoggingStatus(id);
		if (!result) {
			configState.error = `Statement "${id}" not found`;
		} else {
			// Avoid duplicates
			const existing = configState.entries.find((e) => e.statementId === id);
			if (existing) {
				existing.enabled = result.enabled;
				existing.title = result.title;
			} else {
				configState.entries.unshift({ statementId: id, title: result.title, enabled: result.enabled });
			}
			persistEntries(configState.entries);
			configState.inputId = '';
		}
	} catch (err) {
		configState.error = err instanceof Error ? err.message : 'Lookup failed';
	} finally {
		configState.loading = false;
		m.redraw();
	}
}

async function handleToggle(entry: ConfigEntry): Promise<void> {
	const newValue = !entry.enabled;
	try {
		await setResearchLogging(entry.statementId, newValue);
		entry.enabled = newValue;
		persistEntries(configState.entries);
		configState.success = `${newValue ? 'Enabled' : 'Disabled'} research logging for "${entry.title}"`;
		configState.error = null;
	} catch (err) {
		configState.error = err instanceof Error ? err.message : 'Update failed';
		configState.success = null;
	}
	m.redraw();
}

function ResearchConfigPanel(): m.Vnode {
	return m('.research__panel', [
		m('.section-title', 'Research Logging Config'),

		// Input row
		m('.research__config-row', [
			m('input.research__config-input', {
				type: 'text',
				placeholder: 'Enter top-level statement ID...',
				value: configState.inputId,
				oninput: (e: InputEvent) => {
					configState.inputId = (e.target as HTMLInputElement).value;
				},
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === 'Enter') handleLookup();
				},
			}),
			m(
				'button.research__config-btn',
				{
					disabled: configState.loading || !configState.inputId.trim(),
					onclick: handleLookup,
				},
				configState.loading ? 'Looking up...' : 'Add',
			),
		]),

		// Feedback
		configState.error ? m('.research__config-msg.research__config-msg--error', configState.error) : null,
		configState.success ? m('.research__config-msg.research__config-msg--success', configState.success) : null,

		// Entries list
		configState.entries.length > 0
			? m('.research__config-list',
				configState.entries.map((entry) =>
					m('.research__config-entry', [
						m('.research__config-info', [
							m('span.research__config-title', entry.title.length > 60 ? entry.title.slice(0, 60) + '...' : entry.title),
							m('span.research__config-id', entry.statementId),
						]),
						m('.research__config-actions', [
							m(
								'button.research__config-export',
								{
									onclick: () => exportQuestionJSON(entry.statementId),
									title: 'Export this question\'s research logs',
								},
								'\u2B07 Export',
							),
							m(
								'button.research__config-toggle',
								{
									class: entry.enabled ? 'research__config-toggle--on' : '',
									onclick: () => handleToggle(entry),
								},
								entry.enabled ? 'Enabled' : 'Disabled',
							),
						]),
					]),
				),
			)
			: m('.research__empty', 'Add a statement ID to configure research logging'),
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

async function refreshPersistedEntries(): Promise<void> {
	for (const entry of configState.entries) {
		try {
			const result = await getResearchLoggingStatus(entry.statementId);
			if (result) {
				entry.enabled = result.enabled;
				entry.title = result.title;
			}
		} catch { /* ignore */ }
	}
	persistEntries(configState.entries);
	m.redraw();
}

export function ResearchView(): m.Component {
	return {
		oninit() {
			subscribeResearch();
			startTicker();
			refreshPersistedEntries();
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

				// Research Config
				ResearchConfigPanel(),

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

function exportQuestionJSON(questionId: string): void {
	const s = getResearchState();
	const filtered = s.logs.filter(
		(log) => log.parentId === questionId || log.topParentId === questionId || log.statementId === questionId,
	);
	if (filtered.length === 0) {
		configState.error = 'No research logs found for this question';
		configState.success = null;
		m.redraw();

		return;
	}
	exportJSON(filtered, `research-logs_${questionId}_${new Date().toISOString().slice(0, 10)}.json`);
}

function exportJSON(logs: ResearchLog[], filename?: string): void {
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
	a.download = filename || `research-logs_${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

import { FC, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useResearchLogs, ResearchScope } from './useResearchLogs';
import { downloadResearchLogsAsJSON } from '@/controllers/db/researchLogs/researchLogger';
import { getResearchActionLabel } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import type { ResearchLog } from '@freedi/shared-types';
import styles from './ResearchDashboard.module.scss';

const APP_COLORS: Record<string, string> = {
	main: '#5f88e5',
	'mass-consensus': '#48bb78',
	sign: '#ed8936',
};

function formatTimeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 10) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
}

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;

	return String(n);
}

/** Animated counter that rolls up to its target value */
const AnimatedCounter: FC<{ value: number; duration?: number }> = ({ value, duration = 600 }) => {
	const [displayed, setDisplayed] = useState(0);
	const [bumping, setBumping] = useState(false);
	const prevValue = useRef(0);

	useEffect(() => {
		const start = prevValue.current;
		const diff = value - start;
		if (diff === 0) return;

		setBumping(true);
		const bumpTimer = setTimeout(() => setBumping(false), 400);

		const startTime = performance.now();

		function tick(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			setDisplayed(Math.round(start + diff * eased));

			if (progress < 1) {
				requestAnimationFrame(tick);
			} else {
				prevValue.current = value;
			}
		}

		requestAnimationFrame(tick);

		return () => clearTimeout(bumpTimer);
	}, [value, duration]);

	return (
		<span className={`${styles.counterValue} ${bumping ? styles.counterBump : ''}`}>
			{formatNumber(displayed)}
		</span>
	);
};

/** Pulsing dot to show live status */
const PulseDot: FC<{ active: boolean }> = ({ active }) => (
	<span className={`${styles.pulseDot} ${active ? styles.pulseDotActive : ''}`} />
);

/** Activity feed item */
const ActivityItem: FC<{ log: ResearchLog; isNew: boolean }> = ({ log, isNew }) => {
	const appColor = APP_COLORS[log.sourceApp || 'main'] || '#a0aec0';

	return (
		<div className={`${styles.activityItem} ${isNew ? styles.activityItemNew : ''}`}>
			<div className={styles.activityDot} style={{ backgroundColor: appColor }} />
			<div className={styles.activityContent}>
				<span className={styles.activityAction}>{getResearchActionLabel(log.action)}</span>
				{log.newValue && <span className={styles.activityMeta}>{log.newValue}</span>}
			</div>
			<div className={styles.activityMeta}>
				<span className={styles.activityApp}>{log.sourceApp || 'main'}</span>
				<span className={styles.activityTime}>{formatTimeAgo(log.timestamp)}</span>
			</div>
		</div>
	);
};

const ResearchDashboard: FC = () => {
	const { t } = useTranslation();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useAppSelector(statementSelectorById(statementId || ''));
	const topParentId = statement?.topParentId || statementId;
	const [scope, setScope] = useState<ResearchScope>('all');
	const { stats, loading, error } = useResearchLogs(topParentId, scope, statementId);
	const [isExporting, setIsExporting] = useState(false);
	const [, setTick] = useState(0);
	const isTopLevel = !statement?.parentId || statement.parentId === 'top';
	const creator = useAppSelector(creatorSelector);
	const isSysAdmin = creator?.systemAdmin === true;

	// Refresh "time ago" labels every 10s
	useEffect(() => {
		const interval = setInterval(() => setTick((t) => t + 1), 10_000);

		return () => clearInterval(interval);
	}, []);

	const isLive = Date.now() - stats.lastActivityAt < 120_000;

	async function handleExport() {
		if (!topParentId) return;
		setIsExporting(true);
		try {
			await downloadResearchLogsAsJSON(topParentId);
		} finally {
			setIsExporting(false);
		}
	}

	if (loading) {
		return (
			<div className={styles.container}>
				<div className={styles.loadingPulse}>
					<div className={styles.loadingBar} />
					<div className={styles.loadingBar} />
					<div className={styles.loadingBar} />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.container}>
				<div className={styles.errorBox}>{error}</div>
			</div>
		);
	}

	const uniqueUserCount = stats.uniqueUsers.size;

	return (
		<div className={styles.container}>
			{/* Header */}
			<div className={styles.header}>
				<div className={styles.headerLeft}>
					<h2 className={styles.title}>{t('Research Dashboard')}</h2>
					<div className={styles.liveIndicator}>
						<PulseDot active={isLive} />
						<span>{isLive ? t('Live') : t('Inactive')}</span>
					</div>
				</div>
				{isSysAdmin && (
					<button
						className={styles.exportBtn}
						onClick={handleExport}
						disabled={isExporting || stats.totalActions === 0}
					>
						{isExporting ? t('Exporting...') : t('Export JSON')}
					</button>
				)}
			</div>

			{/* Scope Toggle — only show when not at top level */}
			{!isTopLevel && (
				<div className={styles.scopeToggle}>
					<button
						className={`${styles.scopeBtn} ${scope === 'all' ? styles.scopeBtnActive : ''}`}
						onClick={() => setScope('all')}
					>
						{t('All Events')}
					</button>
					<button
						className={`${styles.scopeBtn} ${scope === 'parent' ? styles.scopeBtnActive : ''}`}
						onClick={() => setScope('parent')}
					>
						{t('This Statement Only')}
					</button>
				</div>
			)}

			{/* Stat Cards */}
			<div className={styles.statsGrid}>
				<StatCard label={t('Unique Users')} value={uniqueUserCount} accent="#5f88e5" />
				<StatCard label={t('Total Actions')} value={stats.totalActions} accent="#48bb78" />
				<StatCard label={t('Evaluations')} value={stats.evaluations} accent="#ed8936" />
				<StatCard label={t('Votes')} value={stats.votes} accent="#9f7aea" />
				<StatCard label={t('Statements')} value={stats.statements} accent="#38b2ac" />
				<StatCard label={t('Logins')} value={stats.logins} accent="#e53e3e" />
			</div>

			{/* Rate + App Breakdown */}
			<div className={styles.panelRow}>
				{/* Actions per minute */}
				<div className={styles.panel}>
					<h3 className={styles.panelTitle}>{t('Activity Rate')}</h3>
					<div className={styles.rateDisplay}>
						<AnimatedCounter value={stats.actionsPerMinute} />
						<span className={styles.rateLabel}>{t('actions / min')}</span>
					</div>
				</div>

				{/* App Breakdown */}
				<div className={styles.panel}>
					<h3 className={styles.panelTitle}>{t('By App')}</h3>
					<div className={styles.appBars}>
						{Object.entries(stats.byApp).map(([app, count]) => {
							const pct = stats.totalActions > 0 ? (count / stats.totalActions) * 100 : 0;

							return (
								<div key={app} className={styles.appBarRow}>
									<span
										className={styles.appDot}
										style={{
											backgroundColor: APP_COLORS[app] || '#a0aec0',
										}}
									/>
									<span className={styles.appName}>{app}</span>
									<div className={styles.appBar}>
										<div
											className={styles.appBarFill}
											style={{
												width: `${pct}%`,
												backgroundColor: APP_COLORS[app] || '#a0aec0',
											}}
										/>
									</div>
									<span className={styles.appCount}>{formatNumber(count)}</span>
								</div>
							);
						})}
						{Object.keys(stats.byApp).length === 0 && (
							<span className={styles.emptyText}>{t('No data yet')}</span>
						)}
					</div>
				</div>
			</div>

			{/* Live Activity Feed — system admins only */}
			{isSysAdmin && (
				<div className={styles.panel}>
					<h3 className={styles.panelTitle}>
						{t('Live Activity')}
						<span className={styles.feedCount}>
							{stats.recentLogs.length} {t('recent')}
						</span>
					</h3>
					<div className={styles.activityFeed}>
						{stats.recentLogs.length === 0 ? (
							<div className={styles.emptyFeed}>
								<span className={styles.emptyText}>{t('Waiting for actions...')}</span>
							</div>
						) : (
							stats.recentLogs.map((log) => (
								<ActivityItem key={log.logId} log={log} isNew={stats.newLogIds.has(log.logId)} />
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
};

/** Individual stat card with animated counter */
const StatCard: FC<{ label: string; value: number; accent: string }> = ({
	label,
	value,
	accent,
}) => (
	<div className={styles.statCard}>
		<div className={styles.statCardAccent} style={{ backgroundColor: accent }} />
		<AnimatedCounter value={value} />
		<span className={styles.statLabel}>{label}</span>
	</div>
);

export default ResearchDashboard;

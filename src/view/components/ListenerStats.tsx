import React, { useState, useEffect } from 'react';
import { listenerManager } from '@/controllers/utils/ListenerManager';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import styles from './ListenerStats.module.scss';

export const ListenerStats: React.FC = () => {
	const [stats, setStats] = useState<ReturnType<typeof listenerManager.getOverallStats> | null>(
		null,
	);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isVisible, setIsVisible] = useState(true);
	const user = useAppSelector((state) => state.creator.creator);

	useEffect(() => {
		// Initial stats
		updateStats();

		// Update stats every 2 seconds
		const interval = setInterval(updateStats, 2000);

		// Add keyboard shortcut to toggle visibility (Ctrl/Cmd + Shift + L)
		const handleKeyPress = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
				e.preventDefault();
				setIsVisible((prev) => !prev);
			}
		};

		window.addEventListener('keydown', handleKeyPress);

		return () => {
			clearInterval(interval);
			window.removeEventListener('keydown', handleKeyPress);
		};
	}, []);

	// Enable/disable debug mode based on visibility and authorization
	useEffect(() => {
		const isLocalDevelopment =
			window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		const isAuthorizedUser = user?.email === 'tal.yaron@gmail.com';

		if ((isLocalDevelopment || isAuthorizedUser) && isVisible) {
			listenerManager.setDebugMode(true);
		} else {
			listenerManager.setDebugMode(false);
		}
	}, [isVisible, user?.email]);

	const updateStats = () => {
		const currentStats = listenerManager.getOverallStats();
		setStats(currentStats);
	};

	const handleLogStats = () => {
		listenerManager.logStats();
		console.info('Stats logged to console');
	};

	const handleResetStats = () => {
		if (confirm('Are you sure you want to reset all statistics?')) {
			listenerManager.resetStats();
			updateStats();
		}
	};

	const handleClose = () => {
		setIsVisible(false);
	};

	if (!stats || !isVisible) return null;

	// Only show for tal.yaron@gmail.com or in local development
	const isLocalDevelopment =
		window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
	const isAuthorizedUser = user?.email === 'tal.yaron@gmail.com';

	if (!isLocalDevelopment && !isAuthorizedUser) {
		return null;
	}

	return (
		<div
			className={`${styles['listener-stats']} ${isExpanded ? styles['listener-stats--expanded'] : ''}`}
		>
			<button
				className={styles['listener-stats__close']}
				onClick={handleClose}
				aria-label="Close statistics panel"
				title="Close (Ctrl+Shift+L to reopen)"
			>
				×
			</button>
			<div className={styles['listener-stats__header']} onClick={() => setIsExpanded(!isExpanded)}>
				<div className={styles['listener-stats__title']}>📊 Listeners: {stats.activeListeners}</div>
				<div className={styles['listener-stats__summary']}>
					Docs: {stats.totalDocumentsFetched} | Updates: {stats.totalUpdates}
				</div>
			</div>

			{isExpanded && (
				<div className={styles['listener-stats__content']}>
					<div className={styles['listener-stats__section']}>
						<h3>Overall Statistics</h3>
						<div className={styles['listener-stats__grid']}>
							<div className={styles['listener-stats__item']}>
								<span className={styles['listener-stats__label']}>Active Listeners:</span>
								<span className={styles['listener-stats__value']}>{stats.activeListeners}</span>
							</div>
							<div className={styles['listener-stats__item']}>
								<span className={styles['listener-stats__label']}>Total Documents:</span>
								<span className={styles['listener-stats__value']}>
									{stats.totalDocumentsFetched}
								</span>
							</div>
							<div className={styles['listener-stats__item']}>
								<span className={styles['listener-stats__label']}>Total Updates:</span>
								<span className={styles['listener-stats__value']}>{stats.totalUpdates}</span>
							</div>
							<div className={styles['listener-stats__item']}>
								<span className={styles['listener-stats__label']}>Avg Docs/Update:</span>
								<span className={styles['listener-stats__value']}>
									{stats.averageDocsPerUpdate}
								</span>
							</div>
						</div>
					</div>

					<div className={styles['listener-stats__section']}>
						<h3>Listener Types</h3>
						<div className={styles['listener-stats__types']}>
							<div className={styles['listener-stats__type']}>
								<span>Collections:</span>
								<span>{stats.listenerBreakdown.collection}</span>
							</div>
							<div className={styles['listener-stats__type']}>
								<span>Documents:</span>
								<span>{stats.listenerBreakdown.document}</span>
							</div>
							<div className={styles['listener-stats__type']}>
								<span>Queries:</span>
								<span>{stats.listenerBreakdown.query}</span>
							</div>
						</div>
					</div>

					{stats.topListeners.length > 0 && (
						<div className={styles['listener-stats__section']}>
							<h3>Top Listeners (by document count)</h3>
							<div className={styles['listener-stats__top-listeners']}>
								{stats.topListeners.map((listener, index) => (
									<div key={listener.key} className={styles['listener-stats__listener']}>
										<span className={styles['listener-stats__listener-rank']}>#{index + 1}</span>
										<div className={styles['listener-stats__listener-info']}>
											<div className={styles['listener-stats__listener-key']}>{listener.key}</div>
											<div className={styles['listener-stats__listener-stats']}>
												{listener.documentCount} docs | {listener.updateCount} updates
												{listener.type && ` | ${listener.type}`}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					<div className={styles['listener-stats__actions']}>
						<button className={styles['listener-stats__button']} onClick={handleLogStats}>
							Log to Console
						</button>
						<button
							className={`${styles['listener-stats__button']} ${styles['listener-stats__button--danger']}`}
							onClick={handleResetStats}
						>
							Reset Stats
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

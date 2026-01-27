'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AdminSettingsPanel } from '@/components/versionControl/AdminSettingsPanel';
import { ReviewQueueList } from '@/components/versionControl/ReviewQueueList';
import { ToastNotification } from '@/components/versionControl/ToastNotification';
import styles from './version-control.module.scss';

/**
 * Version Control Admin Page
 * Main admin interface for managing version control settings and review queue
 */
export default function VersionControlPage() {
	const params = useParams();
	const documentId = params.statementId as string;

	const [activeTab, setActiveTab] = useState<'settings' | 'queue'>('queue');

	if (!documentId) {
		return (
			<div className={styles.container}>
				<div className={styles.error}>Document ID not found</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			{/* Page Header */}
			<header className={styles.header}>
				<div>
					<h1 className={styles.title}>Version Control</h1>
					<p className={styles.subtitle}>
						Manage suggestion review queue and version control settings
					</p>
				</div>
			</header>

			{/* Tab Navigation */}
			<div className={styles.tabs}>
				<button
					className={`${styles.tab} ${activeTab === 'queue' ? styles['tab--active'] : ''}`}
					onClick={() => setActiveTab('queue')}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 11l3 3L22 4" />
						<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
					</svg>
					Review Queue
				</button>

				<button
					className={`${styles.tab} ${activeTab === 'settings' ? styles['tab--active'] : ''}`}
					onClick={() => setActiveTab('settings')}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					Settings
				</button>
			</div>

			{/* Tab Content */}
			<div className={styles.content}>
				{activeTab === 'queue' && (
					<div className={styles.tabPanel}>
						<ReviewQueueList documentId={documentId} />
					</div>
				)}

				{activeTab === 'settings' && (
					<div className={styles.tabPanel}>
						<AdminSettingsPanel documentId={documentId} />
					</div>
				)}
			</div>

			{/* Toast Notifications */}
			<ToastNotification />
		</div>
	);
}

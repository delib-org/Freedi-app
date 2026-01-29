'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { AdminSettingsPanel } from '@/components/versionControl/AdminSettingsPanel';
import { ReviewQueueListEnhanced } from '@/components/versionControl/ReviewQueueListEnhanced';
import { ToastNotification } from '@/components/versionControl/ToastNotification';
import { Statement } from 'delib-npm';
import styles from './version-control.module.scss';

/**
 * Version Control Admin Page
 * Main admin interface for managing version control settings and review queue
 */
export default function VersionControlPage() {
	const params = useParams();
	const router = useRouter();
	const documentId = params.statementId as string;
	const { t } = useTranslation();

	const [activeTab, setActiveTab] = useState<'settings' | 'queue'>('queue');
	const [document, setDocument] = useState<Statement | null>(null);
	const [paragraphs, setParagraphs] = useState<Statement[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch document and paragraphs data
	useEffect(() => {
		if (!documentId) return;

		const fetchData = async () => {
			try {
				setIsLoading(true);

				// Fetch paragraphs from the paragraphs API
				const response = await fetch(`/api/admin/paragraphs/${documentId}`);
				if (response.ok) {
					const data = await response.json();
					// The API returns { paragraphs: Statement[] }
					setParagraphs(data.paragraphs || []);

					// Set a mock document for now (just using documentId as title)
					// In a real scenario, you'd fetch this separately
					setDocument({
						statementId: documentId,
						statement: documentId,
					} as Statement);
				}
			} catch (error) {
				console.error('Failed to fetch document data:', error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchData();
	}, [documentId]);

	const handleNavigateToDocument = (paragraphId?: string) => {
		if (paragraphId) {
			router.push(`/doc/${documentId}#${paragraphId}`);
		} else {
			router.push(`/doc/${documentId}`);
		}
	};

	if (!documentId) {
		return (
			<div className={styles.container}>
				<div className={styles.error}>{t('Document ID not found')}</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className={styles.container}>
				<div className={styles.loading}>{t('Loading...')}</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			{/* Page Header */}
			<header className={styles.header}>
				<div>
					<h1 className={styles.title}>{t('Version Control')}</h1>
					<p className={styles.subtitle}>
						{t('Manage suggestion review queue and version control settings')}
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
					{t('Review Queue')}
				</button>

				<button
					className={`${styles.tab} ${activeTab === 'settings' ? styles['tab--active'] : ''}`}
					onClick={() => setActiveTab('settings')}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					{t('Settings')}
				</button>
			</div>

			{/* Tab Content */}
			<div className={styles.content}>
				{activeTab === 'queue' && (
					<div className={styles.tabPanel}>
						<ReviewQueueListEnhanced
							documentId={documentId}
							documentTitle={document?.statement || 'Document'}
							paragraphs={paragraphs}
							onNavigateToDocument={handleNavigateToDocument}
						/>
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

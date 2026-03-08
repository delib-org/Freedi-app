'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { IncoherenceRecord, ChangeDecision } from '@freedi/shared-types';
import { IncoherenceCard } from './IncoherenceCard';
import styles from './coherencePanel.module.scss';

interface CoherencePanelProps {
	documentId: string;
	versionId: string;
}

/**
 * CoherencePanel - Displays coherence analysis results for a version
 * Shows coherence score, incoherence records, and admin review actions
 */
export function CoherencePanel({ documentId, versionId }: CoherencePanelProps) {
	const { t } = useTranslation();
	const [records, setRecords] = useState<IncoherenceRecord[]>([]);
	const [coherenceScore, setCoherenceScore] = useState<number | null>(null);
	const [isOpen, setIsOpen] = useState(true);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchCoherenceData = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const response = await fetch(
				`/api/admin/versions/${documentId}/${versionId}/coherence`
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch coherence data: ${response.status}`);
			}

			const data = await response.json();
			setRecords(data.records || []);
			setCoherenceScore(data.coherenceScore ?? null);
		} catch (err) {
			console.error('[CoherencePanel] Fetch error:', err);
			setError(t('coherenceCheckFailed'));
		} finally {
			setIsLoading(false);
		}
	}, [documentId, versionId, t]);

	useEffect(() => {
		fetchCoherenceData();
	}, [fetchCoherenceData]);

	const handleRecordReviewed = useCallback(
		(recordId: string, decision: ChangeDecision) => {
			setRecords((prev) =>
				prev.map((r) =>
					r.recordId === recordId
						? { ...r, adminDecision: decision, adminReviewedAt: Date.now() }
						: r
				)
			);
		},
		[]
	);

	const getScoreVariant = (): string => {
		if (coherenceScore === null || coherenceScore < 0) return 'unavailable';
		if (coherenceScore >= 0.8) return 'good';
		if (coherenceScore >= 0.5) return 'warning';

		return 'bad';
	};

	const getScoreLabel = (): string => {
		if (coherenceScore === null || coherenceScore < 0) return t('coherenceCheckFailed');

		return `${Math.round(coherenceScore * 100)}%`;
	};

	return (
		<div className={styles.panel}>
			<button
				className={styles.header}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
			>
				<div className={styles.headerLeft}>
					<h3 className={styles.title}>{t('coherenceAnalysis')}</h3>
					<span className={`${styles.scoreBadge} ${styles[`scoreBadge--${getScoreVariant()}`]}`}>
						{getScoreLabel()}
					</span>
				</div>
				<svg
					className={`${styles.chevron} ${isOpen ? styles['chevron--open'] : ''}`}
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{isOpen && (
				<div className={styles.body}>
					{isLoading && (
						<div className={styles.loading}>{t('Loading...')}</div>
					)}

					{error && (
						<div className={styles.error}>{error}</div>
					)}

					{!isLoading && !error && records.length === 0 && (
						<div className={styles.empty}>
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22 4 12 14.01 9 11.01" />
							</svg>
							<p>{t('noIncoherencesFound')}</p>
						</div>
					)}

					{!isLoading && !error && records.length > 0 && (
						<div className={styles.list}>
							{records.map((record) => (
								<IncoherenceCard
									key={record.recordId}
									record={record}
									onReviewed={handleRecordReviewed}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

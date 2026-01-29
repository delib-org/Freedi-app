'use client';

import React, { useEffect, useState } from 'react';
import { useVersionHistoryStore, VersionEntry } from '@/store/versionHistoryStore';
import styles from './versionControl.module.scss';

interface VersionHistoryListProps {
	paragraphId: string;
	isAdmin?: boolean;
}

/**
 * Version History List Component
 * Simple chronological list of versions (MVP - no timeline)
 */
export function VersionHistoryList({ paragraphId, isAdmin = false }: VersionHistoryListProps) {
	const { isLoading, error, loadVersionHistory, restoreVersion, getHistory } =
		useVersionHistoryStore();

	const history = getHistory(paragraphId);
	const loading = isLoading[paragraphId];
	const loadError = error[paragraphId];

	const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
	const [isRestoring, setIsRestoring] = useState(false);
	const [restoreError, setRestoreError] = useState<string | null>(null);

	// Load history on mount
	useEffect(() => {
		loadVersionHistory(paragraphId);
	}, [paragraphId, loadVersionHistory]);

	const handleRestore = async (versionNumber: number) => {
		if (!isAdmin) return;

		const confirmed = confirm(
			`Are you sure you want to restore to version ${versionNumber}? This will create a new version with the old text.`
		);

		if (!confirmed) return;

		setIsRestoring(true);
		setRestoreError(null);

		try {
			await restoreVersion(paragraphId, versionNumber, `Restored from version ${versionNumber}`);
		} catch (error) {
			setRestoreError(error instanceof Error ? error.message : 'Failed to restore version');
		} finally {
			setIsRestoring(false);
		}
	};

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleString();
	};

	const toggleExpand = (versionNumber: number) => {
		setExpandedVersion(expandedVersion === versionNumber ? null : versionNumber);
	};

	if (loading) {
		return (
			<div className={styles['version-history']}>
				<div className={styles['version-history__loading']}>Loading version history...</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles['version-history']}>
				<div className={styles['version-history__error']}>
					Error loading history: {loadError.message}
				</div>
			</div>
		);
	}

	return (
		<div className={styles['version-history']}>
			<h3 className={styles['version-history__title']}>
				Version History ({history.length} versions)
			</h3>

			{restoreError && (
				<div className={styles['version-history__error']}>{restoreError}</div>
			)}

			<div className={styles['version-history__list']}>
				{history.map((version: VersionEntry) => {
					const isExpanded = expandedVersion === version.versionNumber;

					return (
						<div
							key={version.versionNumber}
							className={`${styles['version-entry']} ${version.isCurrent ? styles['version-entry--current'] : ''}`}
						>
							{/* Version Header */}
							<div
								className={styles['version-entry__header']}
								onClick={() => toggleExpand(version.versionNumber)}
							>
								<div className={styles['version-entry__number']}>
									Version {version.versionNumber}
									{version.isCurrent && (
										<span className={styles['version-entry__current-badge']}>Current</span>
									)}
								</div>
								<div className={styles['version-entry__date']}>{formatDate(version.replacedAt)}</div>
								<div className={styles['version-entry__expand']}>
									{isExpanded ? '▼' : '▶'}
								</div>
							</div>

							{/* Version Details (Expanded) */}
							{isExpanded && (
								<div className={styles['version-entry__details']}>
									{/* Text Preview */}
									<div className={styles['version-entry__text']}>
										{version.text.substring(0, 200)}
										{version.text.length > 200 ? '...' : ''}
									</div>

									{/* Metadata */}
									<div className={styles['version-entry__meta']}>
										{version.consensus !== undefined && (
											<span className={styles['version-entry__meta-item']}>
												Consensus: {Math.round(version.consensus * 100)}%
											</span>
										)}
										{version.finalizedBy && (
											<span className={styles['version-entry__meta-item']}>
												Changed by: {version.adminEdited ? 'Admin' : 'Community'}
											</span>
										)}
										{version.adminNotes && (
											<div className={styles['version-entry__notes']}>
												<strong>Admin Notes:</strong> {version.adminNotes}
											</div>
										)}
									</div>

									{/* Restore Button (Admin Only) */}
									{isAdmin && !version.isCurrent && (
										<div className={styles['version-entry__actions']}>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleRestore(version.versionNumber);
												}}
												disabled={isRestoring}
												className={styles['version-entry__restore-button']}
											>
												{isRestoring ? 'Restoring...' : 'Restore This Version'}
											</button>
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { VersionStatus } from '@freedi/shared-types';
import { API_ROUTES } from '@/constants/common';
import styles from './VersionSelector.module.scss';

interface PublicVersion {
	versionId: string;
	documentId: string;
	versionNumber: number;
	status: VersionStatus;
	createdAt: number;
	publishedAt?: number;
	aiGenerated: boolean;
	summary?: string;
	changesCount?: number;
}

interface VersionSelectorProps {
	documentId: string;
	currentVersionNumber?: number;
	onVersionChange?: (versionNumber: number) => void;
}

export default function VersionSelector({
	documentId,
	currentVersionNumber,
	onVersionChange,
}: VersionSelectorProps) {
	const { t, tWithParams } = useTranslation();
	const [versions, setVersions] = useState<PublicVersion[]>([]);
	const [selectedVersion, setSelectedVersion] = useState<number | null>(currentVersionNumber ?? null);
	const [isOpen, setIsOpen] = useState(false);
	const [loading, setLoading] = useState(true);

	const fetchVersions = useCallback(async () => {
		try {
			setLoading(true);
			const response = await fetch(API_ROUTES.VERSIONS(documentId));

			if (response.ok) {
				const data = await response.json();
				setVersions(data.versions || []);

				if (data.currentVersionNumber && !selectedVersion) {
					setSelectedVersion(data.currentVersionNumber);
				}
			}
		} catch (error) {
			console.error('Failed to fetch versions:', error);
		} finally {
			setLoading(false);
		}
	}, [documentId, selectedVersion]);

	useEffect(() => {
		fetchVersions();
	}, [fetchVersions]);

	// Don't show if there are no versions or only one version
	if (loading || versions.length <= 1) {
		return null;
	}

	const currentVersion = versions.find((v) => v.versionNumber === selectedVersion);
	const publishedVersion = versions.find((v) => v.status === VersionStatus.published);

	const handleVersionSelect = (versionNumber: number) => {
		setSelectedVersion(versionNumber);
		setIsOpen(false);
		onVersionChange?.(versionNumber);
	};

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	return (
		<div className={styles.versionSelector}>
			<button
				className={styles.selectorButton}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
			>
				<svg
					className={styles.versionIcon}
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M12 8v4l3 3" />
					<circle cx="12" cy="12" r="10" />
				</svg>
				<span className={styles.versionLabel}>
					{t('version')} {selectedVersion}
				</span>
				{currentVersion?.status === VersionStatus.published && (
					<span className={styles.currentBadge}>{t('current')}</span>
				)}
				<svg
					className={`${styles.chevron} ${isOpen ? styles.open : ''}`}
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>

			{isOpen && (
				<div className={styles.dropdown} role="listbox">
					<div className={styles.dropdownHeader}>
						<span>{t('documentVersions')}</span>
					</div>

					<ul className={styles.versionList}>
						{versions.map((version) => (
							<li key={version.versionId}>
								<button
									className={`${styles.versionItem} ${
										version.versionNumber === selectedVersion ? styles.selected : ''
									}`}
									onClick={() => handleVersionSelect(version.versionNumber)}
									role="option"
									aria-selected={version.versionNumber === selectedVersion}
								>
									<div className={styles.versionInfo}>
										<span className={styles.versionNumber}>
											{t('version')} {version.versionNumber}
										</span>
										{version.status === VersionStatus.published && (
											<span className={styles.statusBadge}>{t('current')}</span>
										)}
									</div>

									<div className={styles.versionMeta}>
										<span className={styles.date}>
											{formatDate(version.publishedAt || version.createdAt)}
										</span>
										{version.changesCount !== undefined && version.changesCount > 0 && (
											<span className={styles.changes}>
												{tWithParams('changesCount', { count: version.changesCount })}
											</span>
										)}
									</div>

									{version.summary && (
										<p className={styles.summary}>{version.summary}</p>
									)}
								</button>
							</li>
						))}
					</ul>

					{publishedVersion && selectedVersion !== publishedVersion.versionNumber && (
						<div className={styles.dropdownFooter}>
							<button
								className={styles.returnButton}
								onClick={() => handleVersionSelect(publishedVersion.versionNumber)}
							>
								{t('returnToCurrent')}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

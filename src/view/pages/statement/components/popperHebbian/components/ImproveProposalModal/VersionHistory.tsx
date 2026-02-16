import React, { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementVersion } from '@/models/popperHebbian';
import { revertToVersion } from '@/controllers/db/popperHebbian/improveProposalController';
import styles from './ImproveProposalModal.module.scss';

interface VersionHistoryProps {
	versions: StatementVersion[];
	currentVersion: number;
	statementId: string;
	onClose: () => void;
	onRevert: () => void;
}

const VersionHistory: FC<VersionHistoryProps> = ({
	versions,
	currentVersion,
	statementId,
	onClose,
	onRevert,
}) => {
	const { t } = useTranslation();
	const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
	const [isReverting, setIsReverting] = useState(false);

	const handleRevert = async (): Promise<void> => {
		if (selectedVersion === null) return;

		setIsReverting(true);
		try {
			await revertToVersion(statementId, versions, selectedVersion);
			onRevert();
		} catch (error) {
			console.error('Failed to revert:', error);
		} finally {
			setIsReverting(false);
		}
	};

	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	// Sort versions by version number descending (newest first)
	const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

	return (
		<Modal closeModal={onClose} title={t('Version History')}>
			<div className={styles.versionHistoryContainer}>
				<div className={styles.modalHeader}>
					<h2 className={styles.modalTitle}>{t('Version History')}</h2>
					<button className={styles.closeButton} onClick={onClose} aria-label={t('Close')}>
						&times;
					</button>
				</div>

				<div className={styles.versionList}>
					{sortedVersions.map((version) => (
						<div
							key={version.version}
							className={`${styles.versionItem} ${
								version.version === currentVersion ? styles.current : ''
							} ${selectedVersion === version.version ? styles.selected : ''}`}
							onClick={() => setSelectedVersion(version.version)}
						>
							<div className={styles.versionHeader}>
								<span className={styles.versionNumber}>
									{t('Version')} {version.version}
									{version.version === currentVersion && (
										<span className={styles.currentBadge}>{t('Current')}</span>
									)}
								</span>
								<span className={styles.versionDate}>{formatDate(version.timestamp)}</span>
							</div>
							<div className={styles.versionMeta}>
								<span className={`${styles.changeType} ${styles[version.changeType]}`}>
									{version.changeType === 'ai-improved' ? t('AI improved') : t('Manual')}
								</span>
								{version.improvementSummary && (
									<span className={styles.versionSummary}>{version.improvementSummary}</span>
								)}
							</div>
							<p className={styles.versionText}>
								<strong>{version.title}</strong>
								{version.description && (
									<>
										<br />
										{version.description.length > 150
											? `${version.description.substring(0, 150)}...`
											: version.description}
									</>
								)}
							</p>
						</div>
					))}
				</div>

				<div className={styles.modalFooter}>
					<button className={styles.cancelButton} onClick={onClose}>
						{t('Cancel')}
					</button>
					<button
						className={styles.revertButton}
						onClick={handleRevert}
						disabled={selectedVersion === null || selectedVersion === currentVersion || isReverting}
					>
						{isReverting ? t('Reverting...') : t('Revert to this version')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default VersionHistory;

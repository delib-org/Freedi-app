import React, { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Framing } from '@freedi/shared-types';
import { deleteFraming } from '@/controllers/db/framing/framingController';
import { logError } from '@/utils/errorHandling';
import styles from './ClusteringAdmin.module.scss';

interface FramingListProps {
	framings: Framing[];
	selectedFraming: Framing | null;
	onSelectFraming: (framing: Framing) => void;
	onDeleteFraming: (framingId: string) => void;
}

const FramingList: FC<FramingListProps> = ({
	framings,
	selectedFraming,
	onSelectFraming,
	onDeleteFraming,
}) => {
	const { t } = useTranslation();
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const handleDelete = async (e: React.MouseEvent, framingId: string) => {
		e.stopPropagation();

		if (!confirm(t('Are you sure you want to delete this framing?'))) {
			return;
		}

		try {
			setDeletingId(framingId);
			await deleteFraming(framingId);
			onDeleteFraming(framingId);
		} catch (err) {
			logError(err, {
				operation: 'FramingList.handleDelete',
				metadata: { framingId },
			});
		} finally {
			setDeletingId(null);
		}
	};

	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	return (
		<div className={styles.framingList}>
			<h4 className={styles.listTitle}>{t('Available Framings')}</h4>
			<div className={styles.framingItems}>
				{framings.map(framing => (
					<div
						key={framing.framingId}
						className={`${styles.framingItem} ${
							selectedFraming?.framingId === framing.framingId
								? styles.selected
								: ''
						}`}
						onClick={() => onSelectFraming(framing)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								onSelectFraming(framing);
							}
						}}
					>
						<div className={styles.framingInfo}>
							<span className={styles.framingName}>{framing.name}</span>
							<span className={styles.framingMeta}>
								{framing.createdBy === 'ai' ? (
									<span className={styles.aiBadge}>{t('AI')}</span>
								) : (
									<span className={styles.customBadge}>{t('Custom')}</span>
								)}
								<span className={styles.date}>
									{formatDate(framing.createdAt)}
								</span>
							</span>
							<span className={styles.clusterCount}>
								{framing.clusterIds.length} {t('clusters')}
							</span>
						</div>
						<button
							className={styles.deleteBtn}
							onClick={(e) => handleDelete(e, framing.framingId)}
							disabled={deletingId === framing.framingId}
							aria-label={t('Delete framing')}
						>
							{deletingId === framing.framingId ? '...' : '×'}
						</button>
					</div>
				))}
			</div>
		</div>
	);
};

export default FramingList;

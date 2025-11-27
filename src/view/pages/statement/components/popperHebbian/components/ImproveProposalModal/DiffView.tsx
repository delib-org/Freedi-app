import React, { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './ImproveProposalModal.module.scss';

interface DiffViewProps {
	original: string;
	improved: string;
}

const DiffView: FC<DiffViewProps> = ({ original, improved }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.diffView}>
			<div className={styles.diffColumn}>
				<h4 className={styles.diffColumnTitle}>{t('Original')}</h4>
				<div className={styles.diffContent}>
					<p className={styles.diffText}>{original}</p>
				</div>
			</div>
			<div className={styles.diffDivider} />
			<div className={styles.diffColumn}>
				<h4 className={styles.diffColumnTitle}>{t('Improved')}</h4>
				<div className={`${styles.diffContent} ${styles.improved}`}>
					<p className={styles.diffText}>{improved}</p>
				</div>
			</div>
		</div>
	);
};

export default DiffView;

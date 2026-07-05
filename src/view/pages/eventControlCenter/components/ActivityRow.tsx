import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { DerivedActivity } from '@/controllers/events/deriveActivities';
import RunStatePill from './RunStatePill';
import styles from '../EventDashboard.module.scss';

interface ActivityRowProps {
	activity: DerivedActivity;
	index: number;
}

/** One agenda row: order, icon, title, engine label, run-state, launch/admin. */
const ActivityRow: FC<ActivityRowProps> = ({ activity, index }) => {
	const { t } = useTranslation();
	const { def, title, participant, admin, runState } = activity;

	return (
		<li className={styles.activity}>
			<span className={styles.activity__order}>{index + 1}</span>
			<span className={styles.activity__icon} aria-hidden="true">
				{def.icon}
			</span>
			<div className={styles.activity__body}>
				<span className={styles.activity__title}>{title || t('Untitled')}</span>
				<span className={styles.activity__type}>{t(def.label)}</span>
			</div>
			<RunStatePill state={runState} />
			<div className={styles.activity__actions}>
				{participant && (
					<a
						className={`${styles.btn} ${styles['btn--primary']}`}
						href={participant.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('Launch')}
					</a>
				)}
				{admin && (
					<a
						className={`${styles.btn} ${styles['btn--secondary']}`}
						href={admin.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('Settings')}
					</a>
				)}
			</div>
		</li>
	);
};

export default ActivityRow;

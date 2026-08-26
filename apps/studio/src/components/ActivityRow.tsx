import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import clsx from 'clsx';
import RunStatePill from './RunStatePill';
import styles from './ActivityRow.module.scss';

interface ActivityRowProps {
	activity: DerivedActivity;
	index: number;
}

export default function ActivityRow({ activity, index }: ActivityRowProps) {
	const { t } = useTranslation();
	const { def, title, participant, admin, runState } = activity;

	return (
		<li className={styles.row}>
			<span className={styles.order}>{index + 1}</span>
			<span className={styles.icon} aria-hidden="true">
				{def.icon}
			</span>
			<div className={styles.body}>
				<span className={styles.title}>{title || t('Untitled')}</span>
				<span className={styles.type}>{t(def.label)}</span>
			</div>
			<RunStatePill state={runState} />
			<div className={styles.actions}>
				{participant && (
					<a
						className={clsx(styles.btn, styles.primary)}
						href={participant.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('Launch')}
					</a>
				)}
				{admin && (
					<a
						className={clsx(styles.btn, styles.secondary)}
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
}

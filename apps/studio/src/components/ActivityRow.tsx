import type { DerivedActivity } from '@freedi/event-core';
import RunStatePill from './RunStatePill';
import styles from './ActivityRow.module.css';

interface ActivityRowProps {
	activity: DerivedActivity;
	index: number;
}

export default function ActivityRow({ activity, index }: ActivityRowProps) {
	const { def, title, participant, admin, runState } = activity;

	return (
		<li className={styles.row}>
			<span className={styles.order}>{index + 1}</span>
			<span className={styles.icon} aria-hidden="true">
				{def.icon}
			</span>
			<div className={styles.body}>
				<span className={styles.title}>{title || 'Untitled'}</span>
				<span className={styles.type}>{def.label}</span>
			</div>
			<RunStatePill state={runState} />
			<div className={styles.actions}>
				{participant && (
					<a
						className={`${styles.btn} ${styles.primary}`}
						href={participant.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						Launch
					</a>
				)}
				{admin && (
					<a
						className={`${styles.btn} ${styles.secondary}`}
						href={admin.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						Settings
					</a>
				)}
			</div>
		</li>
	);
}

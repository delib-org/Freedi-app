import type { ActivityRunState } from '@freedi/event-core';
import styles from './RunStatePill.module.css';

const LABELS: Record<ActivityRunState, string> = {
	queued: 'Queued',
	open: 'Open',
	frozen: 'Frozen',
	closed: 'Closed',
};

export default function RunStatePill({ state }: { state: ActivityRunState }) {
	return <span className={`${styles.pill} ${styles[state]}`}>{LABELS[state]}</span>;
}

import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { ActivityRunState } from '@/controllers/events/deriveActivities';
import styles from '../EventDashboard.module.scss';

const LABELS: Record<ActivityRunState, string> = {
	queued: 'Queued',
	open: 'Open',
	frozen: 'Frozen',
	closed: 'Closed',
};

/** Universal run-state pill: Queued / Open / Frozen / Closed. */
const RunStatePill: FC<{ state: ActivityRunState }> = ({ state }) => {
	const { t } = useTranslation();

	return <span className={`${styles.pill} ${styles[`pill--${state}`]}`}>{t(LABELS[state])}</span>;
};

export default RunStatePill;

import type { ActivityRunState } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import clsx from 'clsx';
import styles from './RunStatePill.module.scss';

/** English-string i18n keys per run state (translated at render time). */
const LABELS: Record<ActivityRunState, string> = {
	queued: 'Queued',
	open: 'Open',
	frozen: 'Frozen',
	closed: 'Closed',
};

export default function RunStatePill({ state }: { state: ActivityRunState }) {
	const { t } = useTranslation();

	return <span className={clsx(styles.pill, styles[state])}>{t(LABELS[state])}</span>;
}

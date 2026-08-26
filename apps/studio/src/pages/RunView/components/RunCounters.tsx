import type { FC } from 'react';
import type { QuestionProgress } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { ProgressStat } from '@/components/atomic/atoms/ProgressStat';
import styles from './RunCounters.module.scss';

/**
 * RunCounters — live funnel numbers for the projector. The labels are the
 * honest ones ("entered / suggested / evaluated"): the progress record counts
 * unique people over the activity's lifetime, not who is in the room now.
 */
export interface RunCountersProps {
	progress?: QuestionProgress;
}

const RunCounters: FC<RunCountersProps> = ({ progress }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.counters} aria-live="polite">
			<ProgressStat value={progress?.entered ?? 0} label={t('Entered')} accent="entered" />
			<ProgressStat value={progress?.suggested ?? 0} label={t('Suggested')} accent="suggested" />
			<ProgressStat value={progress?.evaluated ?? 0} label={t('Evaluated')} accent="evaluated" />
		</div>
	);
};

export default RunCounters;

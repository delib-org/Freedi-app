import { useMemo, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { systemContextFrom } from '@/lib/indicatorContexts';
import { SegmentedControl } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import { LoadError, Loading } from './sections/LoadState';
import styles from './AdminAgora.module.scss';

/** The period tiles above already show these; the trends section keeps only the curves. */
const TILE_DUPLICATES = ['system.gamesFinished', 'system.studentsReached', 'system.classesPlayed'];

type Days = 30 | 90;

/** "Trends" on `/admin/agora`: the system-wide daily series over 30 or 90 days. */
export default function SystemTrends({ enabled }: { enabled: boolean }) {
	const { t } = useTranslation();
	const [days, setDays] = useState<Days>(30);
	const { data, loading, error, refresh } = useSupervisorConsole(
		enabled ? { view: 'system', days } : null,
	);
	const ctx = useMemo(() => (data ? systemContextFrom(data) : null), [data]);

	return (
		<section aria-label={t('Trends')}>
			<div className={styles.kpiHeader}>
				<h2 className={styles.sectionTitle}>{t('Trends')}</h2>
				<SegmentedControl
					ariaLabel={t('Period')}
					segments={[
						{ id: '30', label: t('Last 30 days') },
						{ id: '90', label: t('Last 90 days') },
					]}
					activeId={String(days)}
					onChange={(id) => setDays(id === '90' ? 90 : 30)}
				/>
			</div>
			{loading && <Loading />}
			{error && <LoadError error={error} onRetry={refresh} />}
			{ctx && <IndicatorGrid scope="system" ctx={ctx} hide={TILE_DUPLICATES} />}
		</section>
	);
}

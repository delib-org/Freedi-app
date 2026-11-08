import { useMemo, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOwnTeacherView } from '@/db/agoraTeacher';
import { teacherContextFrom } from '@/lib/indicatorContexts';
import { EmptyState, SegmentedControl } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import LessonsTable from '../AdminAgora/sections/LessonsTable';
import { LoadError, Loading, PrivacyNote, TruncatedNote } from '../AdminAgora/sections/LoadState';
import { PERSONAL_AGORA_BASE } from '../AdminAgora/agoraBase';
import TeacherClassesTable from './TeacherClassesTable';
import styles from '../AdminAgora/AdminDetail.module.scss';

type Granularity = 'day' | 'week';

/**
 * A teacher's own overview: how much they have been teaching (activity), their
 * classes, and their lessons. Everything is the caller's own, served by
 * `agoraTeacherConsole`.
 */
export default function TeacherOverview() {
	const { t } = useTranslation();
	const [granularity, setGranularity] = useState<Granularity>('week');
	const activity = useOwnTeacherView('activity');
	const dashboard = useOwnTeacherView('dashboard');

	const ctx = useMemo(
		() => (activity.data ? teacherContextFrom(activity.data, granularity) : null),
		[activity.data, granularity],
	);
	const classNames = useMemo(
		() => new Map((dashboard.data?.classes ?? []).map((c) => [c.classId, c.name])),
		[dashboard.data],
	);

	const error = activity.error ?? dashboard.error;
	const refresh = () => {
		activity.refresh();
		dashboard.refresh();
	};

	if (error) return <LoadError error={error} onRetry={refresh} />;
	if (activity.loading || dashboard.loading) return <Loading />;
	if (!activity.data || !dashboard.data || !ctx) return null;

	return (
		<>
			{activity.data.truncated && <TruncatedNote />}
			<div className={styles.sectionHead}>
				<h2 className={styles.sectionTitle}>{t('Activity')}</h2>
				<SegmentedControl
					ariaLabel={t('Granularity')}
					segments={[
						{ id: 'day', label: t('By day') },
						{ id: 'week', label: t('By week') },
					]}
					activeId={granularity}
					onChange={(id) => setGranularity(id === 'day' ? 'day' : 'week')}
				/>
			</div>
			<IndicatorGrid scope="teacher" ctx={ctx} />
			<PrivacyNote />

			<h2 className={styles.sectionTitle}>{t('Classes')}</h2>
			<TeacherClassesTable
				classes={dashboard.data.classes}
				aggregates={dashboard.data.aggregates}
			/>

			<h2 className={styles.sectionTitle}>{t('Lessons')}</h2>
			{activity.data.lessonRows.length === 0 ? (
				<EmptyState title={t('No lessons yet')} compact />
			) : (
				<LessonsTable
					rows={activity.data.lessonRows}
					classNames={classNames}
					basePath={PERSONAL_AGORA_BASE}
				/>
			)}
		</>
	);
}

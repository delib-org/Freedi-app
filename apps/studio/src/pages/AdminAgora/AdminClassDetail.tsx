import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { classContextFrom } from '@/lib/indicatorContexts';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import StudioPage from '../_shared/StudioPage';
import { useAgoraDetailAccess } from './agoraBase';
import LessonsTable from './sections/LessonsTable';
import RosterTable from './sections/RosterTable';
import { LoadError, Loading } from './sections/LoadState';
import styles from './AdminDetail.module.scss';

/** `/admin/agora/classes/:classId` — one class's indicators, roster and lessons (system admin, coordinator in scope, or a teacher of the class). */
export default function AdminClassDetail() {
	const { t, tWithParams } = useTranslation();
	const { classId = '' } = useParams<{ classId: string }>();
	const { base, inAdminTree, rootLabel, enabled, denied } = useAgoraDetailAccess();

	const { data, loading, error, refresh } = useSupervisorConsole(
		enabled && classId ? { view: 'class', classId } : null,
	);
	const ctx = useMemo(() => (data ? classContextFrom(data) : null), [data]);

	if (denied) return <Navigate to="/" replace />;

	const title = data ? `${data.name}${data.gradeLevel ? ` · ${data.gradeLevel}` : ''}` : t('Class');
	const crumbs = [
		{ label: rootLabel, to: inAdminTree || !data ? base : `${base}?school=${data.schoolId}` },
		...(data && inAdminTree
			? [{ label: data.schoolName, to: `${base}/schools/${data.schoolId}` }]
			: []),
		{ label: title },
	];

	return (
		<StudioPage breadcrumb={crumbs} title={title}>
			{(!enabled || loading) && <Loading />}
			{error && <LoadError error={error} notFoundText={t('Class not found.')} onRetry={refresh} />}
			{data && ctx && (
				<>
					<p className={styles.meta}>
						{tWithParams('{{count}} students on the roster', { count: data.memberCount })}
						{' · '}
						{tWithParams('{{count}} teachers', { count: data.teachers.length })}
						{data.teachers.length > 0 &&
							`: ${data.teachers.map((teacher) => teacher.name).join(', ')}`}
					</p>
					<IndicatorGrid scope="class" ctx={ctx} />

					<h2 className={styles.sectionTitle}>{t('Roster')}</h2>
					<RosterTable members={data.members} careers={ctx.careers} basePath={base} />

					<h2 className={styles.sectionTitle}>{t('Lessons')}</h2>
					<LessonsTable rows={data.sessions} />
				</>
			)}
		</StudioPage>
	);
}

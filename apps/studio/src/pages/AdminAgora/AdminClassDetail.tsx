import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { classContextFrom } from '@/lib/indicatorContexts';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import LessonsTable from './sections/LessonsTable';
import RosterTable from './sections/RosterTable';
import { LoadError, Loading } from './sections/LoadState';
import styles from './AdminDetail.module.scss';

/** `/admin/agora/classes/:classId` — one class's indicators, roster and lessons (system admins only). */
export default function AdminClassDetail() {
	const { t, tWithParams } = useTranslation();
	const { classId = '' } = useParams<{ classId: string }>();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	const { data, loading, error, refresh } = useSupervisorConsole(
		isSystemAdmin && classId ? { view: 'class', classId } : null,
	);
	const ctx = useMemo(() => (data ? classContextFrom(data) : null), [data]);

	if (denied) return <Navigate to="/" replace />;

	const title = data ? `${data.name}${data.gradeLevel ? ` · ${data.gradeLevel}` : ''}` : t('Class');
	const crumbs = [
		{ label: t('Agora classrooms'), to: '/admin/agora' },
		...(data ? [{ label: data.schoolName, to: `/admin/agora/schools/${data.schoolId}` }] : []),
		{ label: title },
	];

	return (
		<StudioPage breadcrumb={crumbs} title={title}>
			{(!isSystemAdmin || loading) && <Loading />}
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
					<RosterTable members={data.members} careers={ctx.careers} />

					<h2 className={styles.sectionTitle}>{t('Lessons')}</h2>
					<LessonsTable rows={data.sessions} />
				</>
			)}
		</StudioPage>
	);
}

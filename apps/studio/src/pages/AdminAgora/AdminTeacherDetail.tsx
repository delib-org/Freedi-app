import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useAgoraSchool } from '@/db/agoraAdmin';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { teacherContextFrom } from '@/lib/indicatorContexts';
import { SegmentedControl } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import ClassesTable from './sections/ClassesTable';
import LessonsTable from './sections/LessonsTable';
import { LoadError, Loading, PrivacyNote, TruncatedNote } from './sections/LoadState';
import styles from './AdminDetail.module.scss';

const PERIOD_DAYS = 90;
type Granularity = 'day' | 'week';

/** `/admin/agora/teachers/:schoolId/:uid` — one teacher's lessons and console time (system admins only). */
export default function AdminTeacherDetail() {
	const { t } = useTranslation();
	const { schoolId = '', uid = '' } = useParams<{ schoolId: string; uid: string }>();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const denied = useGrace(!orgLoading && !isSystemAdmin);
	const [granularity, setGranularity] = useState<Granularity>('week');

	const { data: school } = useAgoraSchool(schoolId, isSystemAdmin);
	const { data, loading, error, refresh } = useSupervisorConsole(
		isSystemAdmin && schoolId && uid
			? { view: 'teacher', schoolId, teacherId: uid, days: PERIOD_DAYS }
			: null,
	);
	const ctx = useMemo(
		() => (data ? teacherContextFrom(data, granularity) : null),
		[data, granularity],
	);
	const classNames = useMemo(
		() => new Map((data?.classes ?? []).map((c) => [c.classId, c.name])),
		[data],
	);

	if (denied) return <Navigate to="/" replace />;

	const crumbs = [
		{ label: t('Agora classrooms'), to: '/admin/agora' },
		{ label: school?.name ?? t('School'), to: `/admin/agora/schools/${schoolId}` },
		{ label: data?.teacher.name ?? t('Teacher') },
	];

	return (
		<StudioPage breadcrumb={crumbs} title={data?.teacher.name ?? t('Teacher')}>
			{(!isSystemAdmin || loading) && <Loading />}
			{error && (
				<LoadError error={error} notFoundText={t('Teacher not found.')} onRetry={refresh} />
			)}
			{data && ctx && (
				<>
					{data.truncated && <TruncatedNote />}
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
					<ClassesTable rows={data.classes} />

					<h2 className={styles.sectionTitle}>{t('Lessons')}</h2>
					<LessonsTable rows={data.lessonRows} classNames={classNames} />
				</>
			)}
		</StudioPage>
	);
}

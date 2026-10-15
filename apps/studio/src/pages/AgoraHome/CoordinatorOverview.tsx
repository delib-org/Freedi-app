import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { TeacherConsoleDashboard } from '@freedi/shared-types';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { schoolContextFrom } from '@/lib/indicatorContexts';
import { EmptyState, SegmentedControl } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import ClassesTable from '../AdminAgora/sections/ClassesTable';
import TeachersTable from '../AdminAgora/sections/TeachersTable';
import { LoadError, Loading, PrivacyNote, TruncatedNote } from '../AdminAgora/sections/LoadState';
import { PERSONAL_AGORA_BASE } from '../AdminAgora/agoraBase';
import { pickSchoolId, readLastSchool, rememberSchool } from './lastSchool';
import styles from '../AdminAgora/AdminDetail.module.scss';

const PERIOD_DAYS = 90;

/**
 * A regional coordinator's overview: one school at a time (a filter, not a
 * level), its teachers and its classes. Read through the supervisor callable,
 * which applies the coordinator's scope.
 */
export default function CoordinatorOverview({
	schools,
}: {
	schools: TeacherConsoleDashboard['supervisedSchools'];
}) {
	const { t } = useTranslation();
	const [params, setParams] = useSearchParams();
	const schoolId = pickSchoolId(schools, params.get('school'), readLastSchool());
	const { data, loading, error, refresh } = useSupervisorConsole(
		schoolId ? { view: 'overview', schoolId, days: PERIOD_DAYS } : null,
	);
	const school = data?.school ?? null;
	const ctx = useMemo(() => (school ? schoolContextFrom(school) : null), [school]);

	const chooseSchool = (id: string) => {
		rememberSchool(id);
		setParams({ school: id });
	};

	return (
		<>
			{schools.length > 1 && schoolId && (
				<SegmentedControl
					ariaLabel={t('School')}
					segments={schools.map((row) => ({ id: row.schoolId, label: row.name }))}
					activeId={schoolId}
					onChange={chooseSchool}
				/>
			)}
			{loading && <Loading />}
			{error && <LoadError error={error} onRetry={refresh} />}
			{school && ctx && (
				<>
					<h2 className={styles.sectionTitle}>{school.name}</h2>
					{school.truncated && <TruncatedNote />}
					<IndicatorGrid scope="school" ctx={ctx} />

					<h2 className={styles.sectionTitle}>{t("Teachers' activity")}</h2>
					{school.teachers.length === 0 ? (
						<EmptyState title={t('No teachers yet')} compact />
					) : (
						<TeachersTable
							rows={school.teachers}
							schoolId={school.schoolId}
							basePath={PERSONAL_AGORA_BASE}
						/>
					)}
					<PrivacyNote />

					<h2 className={styles.sectionTitle}>{t('Classes')}</h2>
					<ClassesTable rows={school.classes} basePath={PERSONAL_AGORA_BASE} />
				</>
			)}
		</>
	);
}

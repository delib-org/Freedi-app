import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { teacherContext, classContext, studentContext } from '@freedi/shared-charts';
import type { SupervisorConsoleRequest } from '@freedi/shared-types';
import { useOrg } from '@/org/OrgContext';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import IndicatorGrid from '@/components/atomic/molecules/Chart/IndicatorGrid';
import { Button, EmptyState } from '@/components/atomic/atoms';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import { ClassCards, LessonsTable, PrivacyNote } from './SupervisionSections';
import styles from './Supervision.module.scss';

export default function AdminSupervisionDetail({
	view,
}: {
	view: 'teacher' | 'class' | 'student';
}) {
	const { id = '' } = useParams();
	const [params] = useSearchParams();
	const { t, currentLanguage } = useTranslation();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const denied = useGrace(!orgLoading && !isSystemAdmin);
	const [granularity, setGranularity] = useState<'day' | 'week'>('week');
	const request: SupervisorConsoleRequest =
		view === 'teacher'
			? { view, teacherId: id, schoolId: params.get('schoolId') ?? '', days: 90 }
			: view === 'class'
				? { view, classId: id }
				: { view, memberId: id };
	const { data, loading, error, refresh } = useSupervisorConsole(isSystemAdmin ? request : null);
	if (denied) return <Navigate to="/" replace />;
	const title =
		data && 'teacher' in data
			? data.teacher.name
			: data && 'alias' in data
				? data.alias
				: data && 'name' in data
					? data.name
					: t('Supervision');

	return (
		<StudioPage
			title={title}
			breadcrumb={[{ label: t('Agora classrooms'), to: '/admin/agora' }, { label: title }]}
		>
			{(!isSystemAdmin || loading) && <p role="status">{t('Loading…')}</p>}
			{error && (
				<>
					<EmptyState variant="error" title={t('Could not load supervision data.')} compact />
					<Button text={t('Retry')} onClick={refresh} />
				</>
			)}
			{data && 'teacher' in data && (
				<>
					{data.truncated && (
						<p>{t('History is limited to the newest 100 lessons; totals may be incomplete.')}</p>
					)}
					<div className={styles.controls}>
						{(['day', 'week'] as const).map((g) => (
							<Button
								key={g}
								text={t(g === 'day' ? 'Daily' : 'Weekly')}
								variant={granularity === g ? 'primary' : 'secondary'}
								onClick={() => setGranularity(g)}
							/>
						))}
					</div>
					<IndicatorGrid scope="teacher" context={teacherContext(data, granularity)} />
					<PrivacyNote />
					<ClassCards rows={data.classes} />
					<LessonsTable rows={data.lessonRows} />
				</>
			)}
			{data && 'members' in data && (
				<>
					<Link to={`/admin/agora/schools/${data.schoolId}`}>{data.schoolName}</Link>
					<IndicatorGrid scope="class" context={classContext(data)} />
					<ul>
						{data.members.map((m) => (
							<li key={m.memberId}>
								<Link to={`/admin/agora/students/${m.memberId}`}>{m.alias}</Link>
							</li>
						))}
					</ul>
				</>
			)}
			{data && 'alias' in data && (
				<>
					<Link to={`/admin/agora/classes/${data.classId}`}>{data.className}</Link>
					<IndicatorGrid scope="student" context={studentContext(data)} />
					<ul>
						{studentContext(data)
							.career?.perGame.slice()
							.reverse()
							.map((g) => (
								<li key={g.sessionId}>
									{new Date(g.playedAt).toLocaleDateString(currentLanguage)} · {g.points.total}
								</li>
							))}
					</ul>
				</>
			)}
		</StudioPage>
	);
}

import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { studentContextFrom } from '@/lib/indicatorContexts';
import { EmptyState } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import OutcomeTag from './sections/OutcomeTag';
import { LoadError, Loading } from './sections/LoadState';
import { shortDate } from './sections/formatLesson';
import styles from './AdminDetail.module.scss';

/** `/admin/agora/students/:memberId` — one student's career (alias only; system admins only). */
export default function AdminStudentDetail() {
	const { t, currentLanguage } = useTranslation();
	const { memberId = '' } = useParams<{ memberId: string }>();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	const { data, loading, error, refresh } = useSupervisorConsole(
		isSystemAdmin && memberId ? { view: 'student', memberId } : null,
	);
	const ctx = useMemo(() => (data ? studentContextFrom(data) : null), [data]);
	const games = useMemo(
		() => [...(ctx?.career?.perGame ?? [])].sort((a, b) => b.playedAt - a.playedAt),
		[ctx],
	);

	if (denied) return <Navigate to="/" replace />;

	const crumbs = [
		{ label: t('Agora classrooms'), to: '/admin/agora' },
		...(data ? [{ label: data.className, to: `/admin/agora/classes/${data.classId}` }] : []),
		{ label: data?.alias ?? t('Student') },
	];

	return (
		<StudioPage breadcrumb={crumbs} title={data?.alias ?? t('Student')}>
			{(!isSystemAdmin || loading) && <Loading />}
			{error && (
				<LoadError error={error} notFoundText={t('Student not found.')} onRetry={refresh} />
			)}
			{data && ctx && (
				<>
					<p className={styles.meta}>
						{t('Last active')}: {shortDate(data.lastActive, currentLanguage, t('Never'))}
					</p>
					<IndicatorGrid scope="student" ctx={ctx} />

					<h2 className={styles.sectionTitle}>{t('Last games')}</h2>
					{games.length === 0 ? (
						<EmptyState title={t('No lessons yet')} compact />
					) : (
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th scope="col">{t('Date')}</th>
										<th scope="col">{t('Points')}</th>
										<th scope="col">{t('Class score')}</th>
										<th scope="col">{t('Outcome')}</th>
									</tr>
								</thead>
								<tbody>
									{games.map((game) => (
										<tr key={game.sessionId}>
											<th scope="row">{shortDate(game.playedAt, currentLanguage, '—')}</th>
											<td className={styles.number}>{game.points.total}</td>
											<td className={styles.number}>{game.classScoreTotal ?? '—'}</td>
											<td>
												<OutcomeTag outcome={game.outcome} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
		</StudioPage>
	);
}

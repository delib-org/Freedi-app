import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import {
	currentPeriodKeys,
	useAgoraSchools,
	useAgoraStats,
	type AgoraStatsDoc,
} from '@/db/agoraAdmin';
import { Button, EmptyState, SegmentedControl, Skeleton, Tag } from '@/components/atomic/atoms';
import ProgressStat from '@/components/atomic/atoms/ProgressStat/ProgressStat';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import OpenSchoolModal from './OpenSchoolModal';
import styles from './AdminAgora.module.scss';

type PeriodId = 'day' | 'month' | 'year';

/** How the finished games split across the three endings. */
function OutcomeRow({ stats }: { stats: AgoraStatsDoc | null }) {
	const { t } = useTranslation();
	const byOutcome = stats?.byOutcome ?? {};
	const rows: Array<{ key: string; label: string; status: 'open' | 'frozen' | 'closed' }> = [
		{ key: 'success', label: t('Success'), status: 'open' },
		{ key: 'honestDisagreement', label: t('Honest disagreement'), status: 'frozen' },
		{ key: 'collapse', label: t('No agreement'), status: 'closed' },
	];

	return (
		<div className={styles.outcomes}>
			{rows.map((row) => (
				<Tag key={row.key} status={row.status} dot>
					{row.label}: {byOutcome[row.key] ?? 0}
				</Tag>
			))}
		</div>
	);
}

/** `/admin/agora` — the Agora classroom game across every school (system admins only). */
export default function AdminAgora() {
	const { t } = useTranslation();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const [params, setParams] = useSearchParams();
	const [period, setPeriod] = useState<PeriodId>('month');
	const showModal = params.get('new') === '1';
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	const periodKeys = currentPeriodKeys();
	const { data: stats } = useAgoraStats(periodKeys[period], isSystemAdmin);
	const { data: schools, loading, error } = useAgoraSchools(isSystemAdmin);

	if (denied) return <Navigate to="/" replace />;

	if (!isSystemAdmin) {
		return (
			<StudioPage breadcrumb={[{ label: t('Agora classrooms') }]}>
				<div className="studio-loading">{t('Loading…')}</div>
			</StudioPage>
		);
	}

	const openModal = () => setParams({ new: '1' });
	const closeModal = () => setParams({});
	const activeSchools = schools.filter((school) => school.status === 'active');

	return (
		<StudioPage
			breadcrumb={[{ label: t('Agora classrooms') }]}
			title={t('Agora classrooms')}
			actions={<Button text={`+ ${t('Open school')}`} variant="primary" onClick={openModal} />}
		>
			<section className={styles.kpis} aria-label={t('Activity')}>
				<div className={styles.kpiHeader}>
					<h2 className={styles.sectionTitle}>{t('Activity')}</h2>
					<SegmentedControl
						ariaLabel={t('Period')}
						segments={[
							{ id: 'day', label: t('Today') },
							{ id: 'month', label: t('This month') },
							{ id: 'year', label: t('This year') },
						]}
						activeId={period}
						onChange={(id) => setPeriod(id as PeriodId)}
					/>
				</div>
				<div className={styles.kpiGrid}>
					<ProgressStat value={stats?.gamesFinished ?? 0} label={t('Games finished')} />
					<ProgressStat value={stats?.classesPlayed ?? 0} label={t('Classes played')} accent />
					<ProgressStat value={stats?.studentsReached ?? 0} label={t('Students reached')} />
				</div>
				<OutcomeRow stats={stats} />
			</section>

			<section aria-label={t('Schools')}>
				<h2 className={styles.sectionTitle}>{t('Schools')}</h2>

				{loading && (
					<div className={styles.skeleton} aria-hidden="true">
						<Skeleton variant="header" />
						<Skeleton variant="text" />
						<Skeleton variant="text" />
					</div>
				)}

				{error && <EmptyState variant="error" title={t('Could not load the schools.')} compact />}

				{!loading && !error && activeSchools.length === 0 && (
					<EmptyState
						icon="🏫"
						title={t('No schools yet')}
						action={<Button text={`+ ${t('Open school')}`} variant="primary" onClick={openModal} />}
					/>
				)}

				{activeSchools.length > 0 && (
					<table className={styles.table}>
						<thead>
							<tr>
								<th scope="col">{t('School')}</th>
								<th scope="col">{t('City')}</th>
								<th scope="col">{t('Classes')}</th>
							</tr>
						</thead>
						<tbody>
							{activeSchools.map((school) => (
								<tr key={school.schoolId}>
									<th scope="row">
										<Link to={`/admin/agora/schools/${school.schoolId}`}>{school.name}</Link>
									</th>
									<td>{school.city ?? '—'}</td>
									<td className="stat-number">{school.classCount}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			{showModal && <OpenSchoolModal onClose={closeModal} />}
		</StudioPage>
	);
}

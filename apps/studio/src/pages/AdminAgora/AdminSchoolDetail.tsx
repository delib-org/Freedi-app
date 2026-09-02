import { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { advancementSummary, type AgoraClass } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useAgoraClassAggregates, useAgoraClasses, useAgoraSchool } from '@/db/agoraAdmin';
import { openAgoraClass } from '@/db/agoraAdminFunctions';
import { logError } from '@/utils/logError';
import { Button, EmptyState, Input, Skeleton } from '@/components/atomic/atoms';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import OpenClassModal from './OpenClassModal';
import styles from './AdminAgora.module.scss';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One class row's inline teacher-assignment form. */
function AssignTeacher({ agoraClass }: { agoraClass: AgoraClass }) {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const canSubmit = EMAIL_PATTERN.test(email.trim().toLowerCase()) && !busy;

	const assign = async () => {
		if (!canSubmit) return;
		setBusy(true);
		setError('');
		try {
			await openAgoraClass({
				action: 'assignTeacher',
				classId: agoraClass.classId,
				teacherEmail: email.trim().toLowerCase(),
			});
			setEmail('');
		} catch (err) {
			logError(err, { operation: 'AdminSchoolDetail.assignTeacher' });
			setError(t('Could not assign — the teacher must sign in to Agora with Google once first.'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={styles.assign}>
			<Input
				type="email"
				ariaLabel={t('Teacher email')}
				placeholder={t('Teacher email')}
				value={email}
				onChange={setEmail}
			/>
			<Button
				text={busy ? t('Assigning…') : t('Assign teacher')}
				variant="secondary"
				disabled={!canSubmit}
				onClick={() => void assign()}
			/>
			{error && <p className={styles.error}>{error}</p>}
		</div>
	);
}

/** `/admin/agora/schools/:schoolId` — one school's classes (system admins only). */
export default function AdminSchoolDetail() {
	const { t, tWithParams } = useTranslation();
	const { schoolId } = useParams<{ schoolId: string }>();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const [params, setParams] = useSearchParams();
	const showModal = params.get('new') === '1';
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	const { data: school, loading: schoolLoading } = useAgoraSchool(schoolId, isSystemAdmin);
	const { data: classes, loading, error } = useAgoraClasses(schoolId, isSystemAdmin);
	const { data: aggregates } = useAgoraClassAggregates(schoolId, isSystemAdmin);

	const aggregateByClass = useMemo(() => {
		const map = new Map(aggregates.map((aggregate) => [aggregate.classId, aggregate]));

		return map;
	}, [aggregates]);

	if (denied) return <Navigate to="/" replace />;

	if (!isSystemAdmin || schoolLoading) {
		return (
			<StudioPage breadcrumb={[{ label: t('Agora classrooms'), to: '/admin/agora' }]}>
				<div className="studio-loading">{t('Loading…')}</div>
			</StudioPage>
		);
	}

	if (!school) {
		return (
			<StudioPage breadcrumb={[{ label: t('Agora classrooms'), to: '/admin/agora' }]}>
				<EmptyState variant="error" title={t('School not found.')} compact />
			</StudioPage>
		);
	}

	const openModal = () => setParams({ new: '1' });
	const closeModal = () => setParams({});
	const activeClasses = classes
		.filter((agoraClass) => agoraClass.status === 'active')
		.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<StudioPage
			breadcrumb={[{ label: t('Agora classrooms'), to: '/admin/agora' }, { label: school.name }]}
			title={school.name}
			actions={<Button text={`+ ${t('Open class')}`} variant="primary" onClick={openModal} />}
		>
			{school.city && <p className={styles.meta}>{school.city}</p>}

			{loading && (
				<div className={styles.skeleton} aria-hidden="true">
					<Skeleton variant="header" />
					<Skeleton variant="text" />
					<Skeleton variant="text" />
				</div>
			)}

			{error && <EmptyState variant="error" title={t('Could not load the classes.')} compact />}

			{!loading && !error && activeClasses.length === 0 && (
				<EmptyState
					icon="🎓"
					title={t('No classes yet')}
					action={<Button text={`+ ${t('Open class')}`} variant="primary" onClick={openModal} />}
				/>
			)}

			{activeClasses.length > 0 && (
				<ul className={styles.classList}>
					{activeClasses.map((agoraClass) => {
						const aggregate = aggregateByClass.get(agoraClass.classId);
						const summary = aggregate ? advancementSummary(aggregate) : null;

						return (
							<li key={agoraClass.classId} className={styles.classCard}>
								<div className={styles.classHead}>
									<h3 className={styles.className}>
										{agoraClass.name}
										{agoraClass.gradeLevel ? ` · ${agoraClass.gradeLevel}` : ''}
									</h3>
									<code className={styles.classCode}>{agoraClass.classCode}</code>
								</div>
								<p className={styles.meta}>
									{tWithParams('{{count}} students on the roster', {
										count: agoraClass.memberCount,
									})}
									{' · '}
									{tWithParams('{{count}} teachers', { count: agoraClass.teacherIds.length })}
								</p>
								{summary ? (
									<p className={styles.meta}>
										{tWithParams('{{count}} games played', { count: summary.gamesPlayed })}
										{summary.avgClassScore !== null && (
											<>
												{' · '}
												{tWithParams('avg. class score {{score}}', {
													score: summary.avgClassScore,
												})}
											</>
										)}
										{summary.successRate !== null && (
											<>
												{' · '}
												{tWithParams('{{percent}}% success', {
													percent: Math.round(summary.successRate * 100),
												})}
											</>
										)}
									</p>
								) : (
									<p className={styles.meta}>{t('No games played yet')}</p>
								)}
								<AssignTeacher agoraClass={agoraClass} />
							</li>
						);
					})}
				</ul>
			)}

			{showModal && schoolId && <OpenClassModal schoolId={schoolId} onClose={closeModal} />}
		</StudioPage>
	);
}

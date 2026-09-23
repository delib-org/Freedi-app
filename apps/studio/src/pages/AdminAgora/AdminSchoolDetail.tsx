import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { advancementSummary, type AgoraClass, type AgoraSchool } from '@freedi/shared-types';
import { CLASS_INDICATORS } from '@freedi/shared-charts';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useAgoraClassAggregates, useAgoraClasses, useAgoraSchool } from '@/db/agoraAdmin';
import { manageAgoraSchool, openAgoraClass } from '@/db/agoraAdminFunctions';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { classRowContextFrom } from '@/lib/indicatorContexts';
import { logError } from '@/utils/logError';
import { Button, EmptyState, Input, Skeleton } from '@/components/atomic/atoms';
import { IndicatorGrid } from '@/components/atomic/molecules/Chart';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import OpenClassModal from './OpenClassModal';
import SchoolSupervisors, { type TeacherOption } from './SchoolSupervisors';
import TeachersTable from './sections/TeachersTable';
import { LoadError, PrivacyNote, TruncatedNote } from './sections/LoadState';
import styles from './AdminAgora.module.scss';

/** The two-up mini row on each class card: the score line and the participation bars. */
const MINI_IDS = ['class.scorePerLesson', 'class.participation'];
const MINI_HIDE = CLASS_INDICATORS.map((i) => i.id).filter((id) => !MINI_IDS.includes(id));

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

/**
 * The school's own teachers — the ones who may open classes in it themselves.
 * Attached by sign-in email (resolved server-side, never stored); the list
 * shows what the school doc carries, which is uids.
 */
function SchoolTeachers({ school, names }: { school: AgoraSchool; names: Map<string, string> }) {
	const { t, tWithParams } = useTranslation();
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [removing, setRemoving] = useState('');
	const teacherIds = school.teacherIds ?? [];

	const canSubmit = EMAIL_PATTERN.test(email.trim().toLowerCase()) && !busy;

	const attach = async () => {
		if (!canSubmit) return;
		setBusy(true);
		setError('');
		try {
			await manageAgoraSchool({
				action: 'assignTeacher',
				schoolId: school.schoolId,
				teacherEmail: email.trim().toLowerCase(),
			});
			setEmail('');
		} catch (err) {
			logError(err, { operation: 'AdminSchoolDetail.attachTeacher' });
			setError(t('Could not assign — the teacher must sign in to Agora with Google once first.'));
		} finally {
			setBusy(false);
		}
	};

	const detach = async (teacherEmail: string) => {
		if (removing) return;
		setRemoving(teacherEmail);
		setError('');
		try {
			await manageAgoraSchool({ action: 'removeTeacher', schoolId: school.schoolId, teacherEmail });
		} catch (err) {
			logError(err, { operation: 'AdminSchoolDetail.detachTeacher' });
			setError(t('Could not remove the teacher.'));
		} finally {
			setRemoving('');
		}
	};

	return (
		<section className={styles.classCard}>
			<div className={styles.classHead}>
				<h3 className={styles.className}>{t('Teachers of this school')}</h3>
				<span className={styles.meta}>
					{tWithParams('{{count}} teachers', { count: teacherIds.length })}
				</span>
			</div>
			<p className={styles.meta}>
				{t('Teachers attached here open their own classes in this school.')}
			</p>
			{teacherIds.length > 0 && (
				<ul className={styles.teacherList}>
					{teacherIds.map((uid) => (
						<li key={uid} className={styles.teacherRow}>
							<span>{names.get(uid) ?? t('Teacher')}</span>
						</li>
					))}
				</ul>
			)}
			<div className={styles.assign}>
				<Input
					type="email"
					ariaLabel={t('Teacher email')}
					placeholder={t('Teacher email')}
					value={email}
					onChange={setEmail}
				/>
				<Button
					text={busy ? t('Assigning…') : t('Attach teacher')}
					variant="secondary"
					disabled={!canSubmit}
					onClick={() => void attach()}
				/>
				<Button
					text={removing ? t('Removing…') : t('Remove by email')}
					variant="secondary"
					disabled={!EMAIL_PATTERN.test(email.trim().toLowerCase()) || !!removing || busy}
					onClick={() => void detach(email.trim().toLowerCase())}
				/>
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</section>
	);
}

/** `/admin/agora/schools/:schoolId` — one school's teachers, supervisors and classes (system admins only). */
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
	const overview = useSupervisorConsole(
		isSystemAdmin && schoolId ? { view: 'overview', schoolId } : null,
	);
	// Supervisor display names live on the system view (shared with /admin/agora's cache).
	const system = useSupervisorConsole(isSystemAdmin ? { view: 'system', days: 30 } : null);

	const aggregateByClass = useMemo(
		() => new Map(aggregates.map((aggregate) => [aggregate.classId, aggregate])),
		[aggregates],
	);
	const overviewSchool = overview.data?.school ?? null;
	const classRowById = useMemo(
		() => new Map((overviewSchool?.classes ?? []).map((row) => [row.classId, row])),
		[overviewSchool],
	);
	const teacherNames = useMemo(
		() => new Map((overviewSchool?.teachers ?? []).map((row) => [row.uid, row.name])),
		[overviewSchool],
	);
	const supervisorNames = useMemo(
		() =>
			new Map(
				(system.data?.schools ?? [])
					.find((row) => row.schoolId === schoolId)
					?.supervisors.map((row) => [row.uid, row.name]) ?? [],
			),
		[system.data, schoolId],
	);
	// Everyone a supervisor could be narrowed to: the school's own teachers plus every class's.
	const teacherOptions = useMemo<TeacherOption[]>(() => {
		const uids = new Set<string>([
			...(school?.teacherIds ?? []),
			...classes.flatMap((agoraClass) => agoraClass.teacherIds),
			...teacherNames.keys(),
		]);

		return [...uids]
			.map((uid) => ({ uid, name: teacherNames.get(uid) ?? t('Teacher') }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [school, classes, teacherNames, t]);

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
	const refreshConsole = () => {
		overview.refresh();
		system.refresh();
	};
	const activeClasses = classes
		.filter((agoraClass) => agoraClass.status === 'active')
		.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<StudioPage
			breadcrumb={[{ label: t('Agora classrooms'), to: '/admin/agora' }, { label: school.name }]}
			title={school.name}
			actions={
				<>
					<Button text={t('Refresh')} variant="secondary" onClick={refreshConsole} />
					<Button text={`+ ${t('Open class')}`} variant="primary" onClick={openModal} />
				</>
			}
		>
			{school.city && <p className={styles.meta}>{school.city}</p>}

			<SchoolTeachers school={school} names={teacherNames} />
			<SchoolSupervisors
				school={school}
				teachers={teacherOptions}
				supervisorNames={supervisorNames}
				onChanged={refreshConsole}
			/>

			<section aria-label={t("Teachers' activity")}>
				<h2 className={styles.sectionTitle}>{t("Teachers' activity")}</h2>
				{overview.loading && (
					<div className={styles.skeleton} aria-hidden="true">
						<Skeleton variant="header" />
						<Skeleton variant="text" />
					</div>
				)}
				{overview.error && <LoadError error={overview.error} onRetry={overview.refresh} />}
				{overviewSchool && (
					<>
						{overviewSchool.truncated && <TruncatedNote />}
						<TeachersTable rows={overviewSchool.teachers} schoolId={school.schoolId} />
						<PrivacyNote />
					</>
				)}
			</section>

			<section aria-label={t('Classes')}>
				<h2 className={styles.sectionTitle}>{t('Classes')}</h2>

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
							const row = classRowById.get(agoraClass.classId);

							return (
								<li key={agoraClass.classId} className={styles.classCard}>
									<div className={styles.classHead}>
										<h3 className={styles.className}>
											<Link to={`/admin/agora/classes/${agoraClass.classId}`}>
												{agoraClass.name}
												{agoraClass.gradeLevel ? ` · ${agoraClass.gradeLevel}` : ''}
											</Link>
										</h3>
										<code className={styles.classCode}>{agoraClass.classCode}</code>
									</div>
									<p className={styles.meta}>
										{tWithParams('{{count}} students on the roster', {
											count: agoraClass.memberCount,
										})}
										{' · '}
										{tWithParams('{{count}} teachers', { count: agoraClass.teacherIds.length })}
										{agoraClass.teacherIds.length > 0 &&
											`: ${agoraClass.teacherIds.map((uid) => teacherNames.get(uid) ?? t('Teacher')).join(', ')}`}
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
									{row && (
										<IndicatorGrid
											scope="class"
											ctx={classRowContextFrom(row)}
											hide={MINI_HIDE}
											order={MINI_IDS}
											mini
										/>
									)}
									<AssignTeacher agoraClass={agoraClass} />
								</li>
							);
						})}
					</ul>
				)}
			</section>

			{showModal && schoolId && <OpenClassModal schoolId={schoolId} onClose={closeModal} />}
		</StudioPage>
	);
}

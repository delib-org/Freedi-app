import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraSchool } from '@freedi/shared-types';
import { manageAgoraSchool } from '@/db/agoraAdminFunctions';
import { Button, Checkbox, Input, Tag } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import { callableMessage } from '../_shared/callableErrors';
import styles from './AdminAgora.module.scss';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface TeacherOption {
	uid: string;
	name: string;
}

/**
 * One supervisor's "Narrow to teachers" disclosure: every teacher of the
 * school as a checkbox. Nothing checked means the whole school — the server
 * stores that as an absent scope (`teacherIds: null`).
 */
function ScopeEditor({
	school,
	uid,
	teachers,
	onSaved,
}: {
	school: AgoraSchool;
	uid: string;
	teachers: TeacherOption[];
	onSaved: () => void;
}) {
	const { t } = useTranslation();
	const current = school.supervisorScopes?.[uid]?.teacherIds ?? null;
	const [selected, setSelected] = useState<string[]>(current ?? []);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const dirty =
		JSON.stringify([...selected].sort()) !== JSON.stringify([...(current ?? [])].sort());

	const save = async () => {
		if (busy) return;
		setBusy(true);
		setError('');
		try {
			await manageAgoraSchool({
				action: 'setSupervisorScope',
				schoolId: school.schoolId,
				supervisorUid: uid,
				teacherIds: selected.length === 0 ? null : selected,
			});
			onSaved();
		} catch (err) {
			logError(err, {
				operation: 'SchoolSupervisors.setSupervisorScope',
				metadata: { schoolId: school.schoolId, supervisorUid: uid },
			});
			setError(callableMessage(err, t('Could not update supervision. Please try again.')));
		} finally {
			setBusy(false);
		}
	};

	return (
		<details className={styles.scope}>
			<summary>{t('Narrow to teachers')}</summary>
			<p className={styles.meta}>
				{t('Leave every box empty to let this supervisor see all teachers of the school.')}
			</p>
			{teachers.length === 0 ? (
				<p className={styles.meta}>{t('No teachers yet')}</p>
			) : (
				<div className={styles.scopeList}>
					{teachers.map((teacher) => (
						<Checkbox
							key={teacher.uid}
							label={teacher.name}
							checked={selected.includes(teacher.uid)}
							disabled={busy}
							onChange={(checked) =>
								setSelected((ids) =>
									checked ? [...ids, teacher.uid] : ids.filter((id) => id !== teacher.uid),
								)
							}
						/>
					))}
				</div>
			)}
			<div className={styles.assign}>
				<Button
					text={busy ? t('Saving…') : t('Save scope')}
					variant="secondary"
					disabled={busy || !dirty}
					onClick={() => void save()}
				/>
				{selected.length > 0 && (
					<Button
						text={t('All teachers')}
						variant="secondary"
						disabled={busy}
						onClick={() => setSelected([])}
					/>
				)}
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</details>
	);
}

export interface SchoolSupervisorsProps {
	school: AgoraSchool;
	/** Every teacher a supervisor could be narrowed to (school ∪ class teachers). */
	teachers: TeacherOption[];
	/** uid → display name, from the system view. */
	supervisorNames: Map<string, string>;
	/** After any change: refresh the views that carry supervisor names/scopes. */
	onChanged: () => void;
}

/**
 * The school's supervisors — attached and removed by sign-in email
 * (resolved server-side, never stored), each with an optional narrowing to
 * some of the school's teachers. Mirrors `SchoolTeachers` on the same page.
 */
export default function SchoolSupervisors({
	school,
	teachers,
	supervisorNames,
	onChanged,
}: SchoolSupervisorsProps) {
	const { t, tWithParams } = useTranslation();
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState<'' | 'assignSupervisor' | 'removeSupervisor'>('');
	const [error, setError] = useState('');
	const supervisorIds = school.supervisorIds ?? [];
	const validEmail = EMAIL_PATTERN.test(email.trim().toLowerCase());

	const change = async (action: 'assignSupervisor' | 'removeSupervisor') => {
		if (busy || !validEmail) return;
		setBusy(action);
		setError('');
		try {
			await manageAgoraSchool({
				action,
				schoolId: school.schoolId,
				supervisorEmail: email.trim().toLowerCase(),
			});
			setEmail('');
			onChanged();
		} catch (err) {
			logError(err, {
				operation: `SchoolSupervisors.${action}`,
				metadata: { schoolId: school.schoolId },
			});
			setError(
				callableMessage(
					err,
					action === 'assignSupervisor'
						? t('Could not assign — the supervisor must sign in to Agora with Google once first.')
						: t('Could not remove the supervisor.'),
				),
			);
		} finally {
			setBusy('');
		}
	};

	return (
		<section className={styles.classCard} aria-label={t('Supervisors of this school')}>
			<div className={styles.classHead}>
				<h3 className={styles.className}>{t('Supervisors of this school')}</h3>
				<span className={styles.meta}>
					{tWithParams('{{count}} supervisors', { count: supervisorIds.length })}
				</span>
			</div>
			<p className={styles.meta}>
				{t(
					'Supervisors see the teachers of this school in Agora. Narrow each one to some teachers if needed.',
				)}
			</p>
			{supervisorIds.length > 0 && (
				<ul className={styles.supervisorList}>
					{supervisorIds.map((uid) => {
						const scope = school.supervisorScopes?.[uid]?.teacherIds;

						return (
							<li key={uid} className={styles.supervisorRow}>
								<div className={styles.supervisorHead}>
									<span>{supervisorNames.get(uid) ?? t('Supervisor')}</span>
									<Tag status={scope ? 'frozen' : 'open'} dot>
										{scope
											? tWithParams('{{count}} teachers', { count: scope.length })
											: t('All teachers')}
									</Tag>
								</div>
								<ScopeEditor
									key={`${uid}:${JSON.stringify(scope ?? null)}`}
									school={school}
									uid={uid}
									teachers={teachers}
									onSaved={onChanged}
								/>
							</li>
						);
					})}
				</ul>
			)}
			<div className={styles.assign}>
				<Input
					type="email"
					ariaLabel={t('Supervisor email')}
					placeholder={t('Supervisor email')}
					value={email}
					onChange={setEmail}
				/>
				<Button
					text={busy === 'assignSupervisor' ? t('Assigning…') : t('Attach supervisor')}
					variant="secondary"
					disabled={!validEmail || !!busy}
					onClick={() => void change('assignSupervisor')}
				/>
				<Button
					text={busy === 'removeSupervisor' ? t('Removing…') : t('Remove supervisor')}
					variant="secondary"
					disabled={!validEmail || !!busy}
					onClick={() => void change('removeSupervisor')}
				/>
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</section>
	);
}

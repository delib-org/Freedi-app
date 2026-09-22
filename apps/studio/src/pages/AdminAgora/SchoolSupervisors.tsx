import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraSchool, ManageSchoolRequest, SupervisorTeacherRow } from '@freedi/shared-types';
import { useSupervisorConsole } from '@/db/agoraSupervisor';
import { manageAgoraSchool } from '@/db/agoraAdminFunctions';
import { Button, Input } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import styles from './Supervision.module.scss';

function ScopeEditor({
	school,
	uid,
	name,
	teachers,
	onSaved,
}: {
	school: AgoraSchool;
	uid: string;
	name: string;
	teachers: SupervisorTeacherRow[];
	onSaved: () => void;
}) {
	const { t } = useTranslation();
	const current = school.supervisorScopes?.[uid];
	const [all, setAll] = useState(!current);
	const [selected, setSelected] = useState(current?.teacherIds ?? []);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	async function save(): Promise<void> {
		setBusy(true);
		setError(false);
		try {
			await manageAgoraSchool({
				action: 'setSupervisorScope',
				schoolId: school.schoolId,
				supervisorUid: uid,
				teacherIds: all ? null : selected,
			});
			onSaved();
		} catch (error) {
			logError(error, { operation: 'SchoolSupervisors.scope' });
			setError(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<details className={styles.card}>
			<summary>{name}</summary>
			<label>
				<input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
				{t('All teachers')}
			</label>
			{!all && (
				<fieldset>
					<legend>{t('Choose teachers')}</legend>
					{teachers.map((r) => (
						<label className={styles.controls} key={r.uid}>
							<input
								type="checkbox"
								checked={selected.includes(r.uid)}
								onChange={(e) =>
									setSelected((ids) =>
										e.target.checked ? [...ids, r.uid] : ids.filter((id) => id !== r.uid),
									)
								}
							/>
							{r.name}
						</label>
					))}
				</fieldset>
			)}
			<Button text={t('Save scope')} disabled={busy} onClick={() => void save()} />
			{error && <p role="alert">{t('Could not update supervision. Please try again.')}</p>}
		</details>
	);
}
export default function SchoolSupervisors({
	school,
	teachers,
	onSaved,
}: {
	school: AgoraSchool;
	teachers: SupervisorTeacherRow[];
	onSaved: () => void;
}) {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const { data, refresh } = useSupervisorConsole({ view: 'system', days: 30 });
	const names = new Map(
		data?.schools
			.find((s) => s.schoolId === school.schoolId)
			?.supervisors.map((s) => [s.uid, s.name]) ?? [],
	);
	async function change(action: ManageSchoolRequest['action']): Promise<void> {
		if (busy || !email.trim()) return;
		setBusy(true);
		setFailed(false);
		try {
			await manageAgoraSchool({
				action,
				schoolId: school.schoolId,
				supervisorEmail: email.trim().toLowerCase(),
			});
			setEmail('');
			refresh();
			onSaved();
		} catch (error) {
			logError(error, { operation: 'SchoolSupervisors.change' });
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section>
			<h2>{t('Supervisors')}</h2>
			<p>{t('Assign by sign-in email. The supervisor must sign in with Google once first.')}</p>
			<div className={styles.controls}>
				<Input type="email" ariaLabel={t('Supervisor email')} value={email} onChange={setEmail} />
				<Button
					text={t('Assign supervisor')}
					disabled={busy || !email.includes('@')}
					onClick={() => void change('assignSupervisor')}
				/>
				<Button
					text={t('Remove by email')}
					variant="secondary"
					disabled={busy || !email.includes('@')}
					onClick={() => void change('removeSupervisor')}
				/>
			</div>
			{failed && <p role="alert">{t('Could not update supervision. Please try again.')}</p>}
			{(school.supervisorIds ?? []).map((uid) => (
				<ScopeEditor
					key={`${uid}:${JSON.stringify(school.supervisorScopes?.[uid])}`}
					school={school}
					uid={uid}
					name={names.get(uid) ?? t('Supervisor')}
					teachers={teachers}
					onSaved={onSaved}
				/>
			))}
		</section>
	);
}

import { useState } from 'react';
import type { AgoraSchool } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAgoraTeacherInvites } from '@/db/agoraAdmin';
import { manageAgoraSchool } from '@/db/agoraAdminFunctions';
import { logError } from '@/utils/logError';
import { Button, Input } from '@/components/atomic/atoms';
import RemoveAccess from '../../AccessRequests/RemoveAccess';
import { refreshAccessCount } from '../../AccessRequests/accessCount';
import { useAccessActor } from '../../AccessRequests/useAccessActor';
import PendingInvites from './PendingInvites';
import styles from '../AdminAgora.module.scss';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The school's own teachers — the ones who may open classes in it themselves.
 * Attached by sign-in email (resolved server-side); the list shows what the
 * school doc carries, which is uids. An email with no account yet becomes a
 * pending invite (listed below, with Resend / Cancel) and the person is
 * emailed; they join when they sign in to Agora with Google using it.
 */
export default function SchoolTeachers({
	school,
	names,
	onChanged,
}: {
	school: AgoraSchool;
	names: Map<string, string>;
	onChanged: () => void;
}) {
	const { t, tWithParams } = useTranslation();
	const actor = useAccessActor();
	const { data: invites } = useAgoraTeacherInvites(school.schoolId, true);
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const [removing, setRemoving] = useState('');
	const teacherIds = school.teacherIds ?? [];

	const normalized = email.trim().toLowerCase();
	const canSubmit = EMAIL_PATTERN.test(normalized) && !busy;

	const attach = async () => {
		if (!canSubmit) return;
		setBusy(true);
		setError('');
		setMessage('');
		try {
			const res = await manageAgoraSchool({
				action: 'assignTeacher',
				schoolId: school.schoolId,
				teacherEmail: normalized,
			});
			if (res.invited) {
				if (res.emailSent === false) {
					setError(
						t('The invitation was saved, but the email could not be sent — try Resend invitation.'),
					);
				} else {
					setMessage(
						tWithParams(
							'Invitation sent to {{email}}. They join this school when they sign in to Agora with Google.',
							{ email: normalized },
						),
					);
				}
			} else {
				setMessage(
					res.emailSent === false
						? t('Teacher attached. The notification email could not be sent.')
						: t('Teacher attached and notified by email.'),
				);
				onChanged();
			}
			setEmail('');
		} catch (err) {
			logError(err, { operation: 'SchoolTeachers.attachTeacher' });
			setError(t('Could not attach the teacher.'));
		} finally {
			setBusy(false);
		}
	};

	const detach = async (teacherEmail: string) => {
		if (removing) return;
		setRemoving(teacherEmail);
		setError('');
		setMessage('');
		try {
			const res = await manageAgoraSchool({
				action: 'removeTeacher',
				schoolId: school.schoolId,
				teacherEmail,
			});
			if (!res.teacherUid && res.inviteCancelled) setMessage(t('Invitation cancelled.'));
		} catch (err) {
			logError(err, { operation: 'SchoolTeachers.detachTeacher' });
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
				{t('Teachers attached here open their own classes in this school.')}{' '}
				{t(
					'No Agora account yet? They get an email invitation and join when they sign in with Google.',
				)}
			</p>
			{teacherIds.length > 0 && (
				<ul className={styles.teacherList}>
					{teacherIds.map((uid) => (
						<li key={uid} className={styles.teacherRow}>
							<span>{names.get(uid) ?? t('Teacher')}</span>
							{actor && (
								<span className={styles.removeSlot}>
									<RemoveAccess
										actor={actor}
										target={{ uid, role: 'teacher', schoolId: school.schoolId }}
										personName={names.get(uid) ?? t('Teacher')}
										schoolName={school.name}
										onRemoved={() => {
											void refreshAccessCount();
											onChanged();
										}}
									/>
								</span>
							)}
						</li>
					))}
				</ul>
			)}
			<PendingInvites schoolId={school.schoolId} invites={invites} />
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
					disabled={!EMAIL_PATTERN.test(normalized) || !!removing || busy}
					onClick={() => void detach(normalized)}
				/>
				<div className={styles.assignStatus} aria-live="polite">
					{message && <p className={styles.meta}>{message}</p>}
					{error && <p className={styles.error}>{error}</p>}
				</div>
			</div>
		</section>
	);
}

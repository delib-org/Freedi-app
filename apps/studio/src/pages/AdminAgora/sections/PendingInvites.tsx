import { useState } from 'react';
import type { AgoraTeacherInvite } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { manageAgoraSchool } from '@/db/agoraAdminFunctions';
import { logError } from '@/utils/logError';
import { Badge, Button } from '@/components/atomic/atoms';
import styles from '../AdminAgora.module.scss';

type Busy = { email: string; action: 'resend' | 'cancel' } | null;

/**
 * The school's pending teacher invites: an email nobody had an account for
 * yet. Each row can be re-sent or cancelled; when the teacher signs in to
 * Agora with Google using that address, the row leaves this list on its own
 * (the invite turns `accepted` and the teacher appears above).
 */
export default function PendingInvites({
	schoolId,
	invites,
}: {
	schoolId: string;
	invites: AgoraTeacherInvite[];
}) {
	const { t } = useTranslation();
	const [busy, setBusy] = useState<Busy>(null);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');

	const pending = invites
		.filter((invite) => invite.status === 'pending')
		.sort((a, b) => a.email.localeCompare(b.email));
	if (pending.length === 0) return null;

	const resend = async (email: string) => {
		if (busy) return;
		setBusy({ email, action: 'resend' });
		setMessage('');
		setError('');
		try {
			const res = await manageAgoraSchool({
				action: 'resendTeacherInvite',
				schoolId,
				teacherEmail: email,
			});
			if (res.emailSent === false) {
				setError(
					t('The invitation was saved, but the email could not be sent — try Resend invitation.'),
				);
			} else {
				setMessage(t('Invitation sent again.'));
			}
		} catch (err) {
			logError(err, { operation: 'PendingInvites.resend', metadata: { schoolId } });
			setError(t('Could not resend the invitation.'));
		} finally {
			setBusy(null);
		}
	};

	const cancel = async (email: string) => {
		if (busy) return;
		setBusy({ email, action: 'cancel' });
		setMessage('');
		setError('');
		try {
			await manageAgoraSchool({ action: 'cancelTeacherInvite', schoolId, teacherEmail: email });
			setMessage(t('Invitation cancelled.'));
		} catch (err) {
			logError(err, { operation: 'PendingInvites.cancel', metadata: { schoolId } });
			setError(t('Could not cancel the invitation.'));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className={styles.invites}>
			<h4 className={styles.invitesTitle}>{t('Invited teachers')}</h4>
			<ul className={styles.inviteList}>
				{pending.map((invite) => {
					const rowBusy = busy?.email === invite.email ? busy.action : null;

					return (
						<li key={invite.inviteId} className={styles.inviteRow}>
							<span className={styles.inviteEmail} dir="ltr">
								{invite.email}
							</span>
							<Badge variant="warning" pill>
								{t('Invited – not signed in yet')}
							</Badge>
							<span className={styles.inviteActions}>
								<Button
									text={rowBusy === 'resend' ? t('Sending invitation…') : t('Resend invitation')}
									variant="secondary"
									disabled={!!busy}
									onClick={() => void resend(invite.email)}
								/>
								<Button
									text={rowBusy === 'cancel' ? t('Cancelling invitation…') : t('Cancel invitation')}
									variant="secondary"
									disabled={!!busy}
									onClick={() => void cancel(invite.email)}
								/>
							</span>
						</li>
					);
				})}
			</ul>
			<div aria-live="polite">
				{message && <p className={styles.meta}>{message}</p>}
				{error && <p className={styles.error}>{error}</p>}
			</div>
		</div>
	);
}

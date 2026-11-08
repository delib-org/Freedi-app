import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AccessRequestRow, AccessSchoolOption } from '@freedi/shared-types';
import { Button } from '@/components/atomic/atoms';
import { approveAccessRequest } from '@/db/agoraAccess';
import { logError } from '@/utils/logError';
import { callableMessage } from '../_shared/callableErrors';
import ApproveDialog from './ApproveDialog';
import DeclineDialog from './DeclineDialog';
import { refreshAccessCount } from './accessCount';
import styles from './AccessRequests.module.scss';

export type Decision = 'approved' | 'declined';

/**
 * Approve and Decline for one pending request. Shown only when the caller may
 * decide (the screens pass `canDecideAccessRequest`'s answer). A coordinator's
 * approval of a teacher is one tap; an admin choosing a school, or approving a
 * coordinator, goes through the picker; declining always asks first.
 */
export default function RequestActions({
	request,
	isAdmin,
	schools,
	onDecided,
}: {
	request: AccessRequestRow;
	isAdmin: boolean;
	schools?: AccessSchoolOption[];
	onDecided: (decision: Decision) => void;
}) {
	const { t } = useTranslation();
	const [dialog, setDialog] = useState<'' | 'approve' | 'decline'>('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const needsPicker = isAdmin && (request.role === 'supervisor' || !request.schoolId);

	const decided = (decision: Decision) => {
		setDialog('');
		void refreshAccessCount();
		onDecided(decision);
	};

	const approve = async () => {
		if (needsPicker) {
			setDialog('approve');

			return;
		}
		if (busy) return;
		setBusy(true);
		setError('');
		try {
			await approveAccessRequest({ requestId: request.requestId });
			decided('approved');
		} catch (err) {
			logError(err, {
				operation: 'RequestActions.approve',
				metadata: { requestId: request.requestId, role: request.role },
			});
			setError(callableMessage(err, t('Something went wrong. Please try again.')));
			setBusy(false);
		}
	};

	return (
		<>
			<div className={styles.actions}>
				<Button
					text={busy ? t('Working…') : t('Approve')}
					variant="primary"
					disabled={busy}
					onClick={() => void approve()}
				/>
				<Button
					text={t('Decline request')}
					variant="secondary"
					disabled={busy}
					onClick={() => setDialog('decline')}
				/>
			</div>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{dialog === 'approve' && (
				<ApproveDialog
					request={request}
					schools={schools}
					onApproved={() => decided('approved')}
					onClose={() => setDialog('')}
				/>
			)}
			{dialog === 'decline' && (
				<DeclineDialog
					requestId={request.requestId}
					onDeclined={() => decided('declined')}
					onClose={() => setDialog('')}
				/>
			)}
		</>
	);
}

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { AGORA_ACCESS } from '@freedi/shared-types';
import { Input } from '@/components/atomic/atoms';
import { declineAccessRequest } from '@/db/agoraAccess';
import ConfirmDialog from './ConfirmDialog';

/** Decline a request: an optional reason (it goes into the applicant's email), then confirm. */
export default function DeclineDialog({
	requestId,
	onDeclined,
	onClose,
}: {
	requestId: string;
	onDeclined: () => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [reason, setReason] = useState('');

	return (
		<ConfirmDialog
			title={t('Decline request')}
			message={t('The applicant is told the request was not approved. They may apply again.')}
			confirmText={t('Decline request')}
			operation="DeclineDialog.decline"
			onClose={onClose}
			onConfirm={async () => {
				await declineAccessRequest(requestId, reason.trim() || undefined);
				onDeclined();
			}}
		>
			<Input
				as="textarea"
				rows={3}
				label={t('Reason (optional)')}
				ariaLabel={t('Reason (optional)')}
				value={reason}
				maxLength={AGORA_ACCESS.MAX_REASON_LENGTH}
				onChange={setReason}
			/>
		</ConfirmDialog>
	);
}

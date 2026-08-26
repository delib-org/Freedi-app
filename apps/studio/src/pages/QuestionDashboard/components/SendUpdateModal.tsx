import { useEffect, useState, type FC } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { NudgeComposer, type NudgePayload } from '@/components/atomic/molecules/NudgeComposer';
import { nudgeQuestionSubscribers } from '@/db/orgFunctions';
import type { ProgressCounts } from '@/db/progress';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/**
 * SendUpdateModal — nudge everyone subscribed to the TOP question.
 * Audience counts come from the roll-up funnel (clamped ≥ 0).
 */
export interface SendUpdateModalProps {
	isOpen: boolean;
	qId: string;
	totals: ProgressCounts;
	lastNudgeAt?: number;
	onClose: () => void;
	/** Called with the number of people actually reached. */
	onSent: (count: number) => void;
}

/** Firebase callable error code when the hourly nudge limit was hit. */
const RESOURCE_EXHAUSTED = 'functions/resource-exhausted';

function readCallableError(error: unknown): { code?: string; message?: string } {
	if (typeof error !== 'object' || error === null) return {};
	const { code, message } = error as { code?: unknown; message?: unknown };

	return {
		code: typeof code === 'string' ? code : undefined,
		message: typeof message === 'string' ? message : undefined,
	};
}

const SendUpdateModal: FC<SendUpdateModalProps> = ({
	isOpen,
	qId,
	totals,
	lastNudgeAt,
	onClose,
	onSent,
}) => {
	const { t } = useTranslation();
	const [limitMessage, setLimitMessage] = useState('');

	useEffect(() => {
		if (isOpen) setLimitMessage('');
	}, [isOpen]);

	const counts = {
		all: Math.max(0, totals.entered),
		notSuggested: Math.max(0, totals.entered - totals.suggested),
		notEvaluated: Math.max(0, totals.entered - totals.evaluated),
	};

	const handleSend = async (payload: NudgePayload) => {
		try {
			const result = await nudgeQuestionSubscribers({ statementId: qId, ...payload });
			onSent(result.sent);
		} catch (error) {
			const { code, message } = readCallableError(error);
			if (code === RESOURCE_EXHAUSTED) {
				// Rate-limited: show the function's own explanation instead of the
				// composer's generic failure. Swapping the composer out below also
				// keeps it from flashing its "sent" state.
				setLimitMessage(message || t('You sent an update recently. Please try again later.'));

				return;
			}
			logError(error, {
				operation: 'SendUpdateModal.send',
				statementId: qId,
				metadata: { audience: payload.audience, channels: payload.channels },
			});
			throw error;
		}
	};

	return (
		<ModalFrame isOpen={isOpen} onClose={onClose} title={t('Send an update')} size="medium">
			{limitMessage ? (
				<div role="alert">
					<p>{limitMessage}</p>
					<Button text={t('Close')} variant="secondary" onClick={onClose} />
				</div>
			) : (
				<NudgeComposer
					inline
					counts={counts}
					lastNudgeAt={lastNudgeAt}
					emailEnabled
					onSend={handleSend}
					onCancel={onClose}
				/>
			)}
		</ModalFrame>
	);
};

export default SendUpdateModal;

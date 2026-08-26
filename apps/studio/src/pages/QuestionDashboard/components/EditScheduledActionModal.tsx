import { useEffect, useId, useRef, useState, type FC } from 'react';
import { STUDIO_NUDGE_MESSAGE_MAX, type ScheduledAction } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { ACTION_LABELS } from '@/components/atomic/atoms/Tag';
import { scheduledActionUpsert } from '@/db/orgFunctions';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/utils/formatDateTime';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/**
 * EditScheduledActionModal — change when a pending action runs (and, for a
 * reminder, what it says). Uses the shared `.input` classes around a native
 * datetime-local field so the browser's picker does the heavy lifting.
 */
export interface EditScheduledActionModalProps {
	isOpen: boolean;
	action: ScheduledAction | null;
	onClose: () => void;
	onSaved: () => void;
}

const EditScheduledActionModal: FC<EditScheduledActionModalProps> = ({
	isOpen,
	action,
	onClose,
	onSaved,
}) => {
	const { t } = useTranslation();
	const whenId = useId();
	const messageId = useId();
	const whenRef = useRef<HTMLInputElement>(null);
	const [when, setWhen] = useState('');
	const [message, setMessage] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!isOpen || !action) return;
		setWhen(toDateTimeLocalValue(action.runAt));
		setMessage(action.nudge?.message ?? '');
		setError('');
		setSaving(false);
	}, [isOpen, action]);

	const isNudge = action?.action === 'nudge';
	const runAt = fromDateTimeLocalValue(when);
	const minValue = toDateTimeLocalValue(Date.now());
	const canSave =
		!saving && runAt !== null && runAt > Date.now() && (!isNudge || message.trim().length > 0);

	const handleSave = async () => {
		if (!action || !canSave || runAt === null) return;
		setSaving(true);
		setError('');
		try {
			await scheduledActionUpsert({
				scheduledActionId: action.scheduledActionId,
				statementId: action.statementId,
				action: action.action,
				runAt,
				nudge: isNudge
					? {
							message: message.trim(),
							audience: action.nudge?.audience,
							channels: action.nudge?.channels,
						}
					: undefined,
			});
			setSaving(false);
			onSaved();
		} catch (err) {
			logError(err, {
				operation: 'EditScheduledActionModal.save',
				statementId: action.statementId,
				metadata: { scheduledActionId: action.scheduledActionId, action: action.action },
			});
			setError(t('Could not save the changes. Please try again.'));
			setSaving(false);
		}
	};

	return (
		<ModalFrame
			isOpen={isOpen}
			onClose={saving ? () => undefined : onClose}
			title={action ? `${t('Edit')}: ${t(ACTION_LABELS[action.action])}` : t('Edit')}
			size="small"
			initialFocusRef={whenRef}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" onClick={onClose} disabled={saving} />
					<Button
						text={t('Save')}
						variant="primary"
						disabled={!canSave}
						loading={saving}
						onClick={() => void handleSave()}
					/>
				</>
			}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void handleSave();
				}}
			>
				<div className="input input--full-width">
					<label htmlFor={whenId} className="input__label">
						{t('Date and time')}
					</label>
					<div className="input__container">
						<input
							ref={whenRef}
							id={whenId}
							type="datetime-local"
							className="input__field"
							value={when}
							min={minValue}
							required
							onChange={(event) => setWhen(event.target.value)}
						/>
					</div>
					{runAt !== null && runAt <= Date.now() && (
						<span className="input__error-text" role="alert">
							{t('Pick a time in the future.')}
						</span>
					)}
				</div>

				{isNudge && (
					<div className="input input--full-width">
						<label htmlFor={messageId} className="input__label">
							{t('Message')}
						</label>
						<div className="input__container">
							<textarea
								id={messageId}
								className="input__field"
								rows={3}
								maxLength={STUDIO_NUDGE_MESSAGE_MAX}
								value={message}
								dir="auto"
								onChange={(event) => setMessage(event.target.value)}
							/>
						</div>
						<span className="input__character-count">
							{message.length}/{STUDIO_NUDGE_MESSAGE_MAX}
						</span>
					</div>
				)}

				{error && <p role="alert">{error}</p>}
			</form>
		</ModalFrame>
	);
};

export default EditScheduledActionModal;

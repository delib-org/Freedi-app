import { useEffect, useId, useRef, useState, type FC } from 'react';
import {
	DEFAULT_DRAFT_CUTOFF,
	STUDIO_NUDGE_MESSAGE_MAX,
	type ScheduledAction,
} from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { ACTION_LABELS } from '@/components/atomic/atoms/Tag';
import { DraftSettingsFields } from '@/components/atomic/molecules/DraftSettingsFields';
import { scheduledActionUpsert } from '@/db/orgFunctions';
import { isCutoffValid, type DraftSettings } from '@/utils/draftSettings';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/utils/formatDateTime';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/**
 * EditScheduledActionModal — change when a pending action runs (and, for a
 * reminder, what it says; for a draft, its sources, cutoff and intent).
 * Uses the shared `.input` classes around a native datetime-local field so
 * the browser's picker does the heavy lifting.
 */
export interface EditScheduledActionModalProps {
	isOpen: boolean;
	action: ScheduledAction | null;
	/** The question's activities — the source choices of a draft action. */
	activities?: DerivedActivity[];
	onClose: () => void;
	onSaved: () => void;
}

function draftSettingsOf(action: ScheduledAction | null): DraftSettings {
	return {
		sourceStatementIds: action?.draft?.sourceStatementIds ?? [],
		cutoff: action?.draft?.cutoff ?? { ...DEFAULT_DRAFT_CUTOFF },
		intent: action?.draft?.intent ?? '',
	};
}

const EditScheduledActionModal: FC<EditScheduledActionModalProps> = ({
	isOpen,
	action,
	activities = [],
	onClose,
	onSaved,
}) => {
	const { t } = useTranslation();
	const whenId = useId();
	const messageId = useId();
	const whenRef = useRef<HTMLInputElement>(null);
	const [when, setWhen] = useState('');
	const [message, setMessage] = useState('');
	const [draft, setDraft] = useState<DraftSettings>(() => draftSettingsOf(null));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!isOpen || !action) return;
		setWhen(toDateTimeLocalValue(action.runAt));
		setMessage(action.nudge?.message ?? '');
		setDraft(draftSettingsOf(action));
		setError('');
		setSaving(false);
	}, [isOpen, action]);

	const isNudge = action?.action === 'nudge';
	const isDraft = action?.action === 'draft';
	const runAt = fromDateTimeLocalValue(when);
	const minValue = toDateTimeLocalValue(Date.now());
	const draftValid = draft.sourceStatementIds.length > 0 && isCutoffValid(draft.cutoff);
	const canSave =
		!saving &&
		runAt !== null &&
		runAt > Date.now() &&
		(!isNudge || message.trim().length > 0) &&
		(!isDraft || draftValid);

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
				draft: isDraft
					? {
							sourceStatementIds: draft.sourceStatementIds,
							cutoff: draft.cutoff,
							intent: draft.intent.trim() || undefined,
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
			size={isDraft ? 'medium' : 'small'}
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

				{isDraft && (
					<DraftSettingsFields
						activities={activities}
						excludeId={action?.statementId}
						value={draft}
						onChange={setDraft}
						disabled={saving}
					/>
				)}

				{error && <p role="alert">{error}</p>}
			</form>
		</ModalFrame>
	);
};

export default EditScheduledActionModal;

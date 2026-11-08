import { useEffect, useState, type FC } from 'react';
import type { OrganizationActivity, Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { Input } from '@/components/atomic/atoms/Input';
import { updateStatementFields } from '@/db/statements';
import { renameOrgActivity, unlinkOrgStatement } from '@/db/orgFunctions';
import { callableMessage } from '@/pages/_shared/callableErrors';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/**
 * EditQuestionModal — rename the top question / edit its description.
 *
 * For a question LINKED into this organization there is a second name: the
 * board name, which only this organization sees. Both are edited here, and the
 * modal is also where a link is removed — removing a link takes nothing away
 * from the question itself, so it sits beside the save action rather than
 * behind the archive flow.
 */
export interface EditQuestionModalProps {
	isOpen: boolean;
	question: Statement;
	/** The link record when this question was added from elsewhere. */
	activity?: OrganizationActivity | null;
	organizationId?: string;
	onClose: () => void;
	onSaved: () => void;
	/** Called after the link is removed; the question is no longer on the board. */
	onUnlinked?: () => void;
}

const EditQuestionModal: FC<EditQuestionModalProps> = ({
	isOpen,
	question,
	activity,
	organizationId,
	onClose,
	onSaved,
	onUnlinked,
}) => {
	const { t } = useTranslation();
	const [title, setTitle] = useState(question.statement);
	const [description, setDescription] = useState(question.description ?? '');
	const [boardName, setBoardName] = useState('');
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [error, setError] = useState('');

	const isLinked = Boolean(activity && organizationId);

	// Re-seed the form each time the modal opens.
	useEffect(() => {
		if (!isOpen) return;
		setTitle(question.statement);
		setDescription(question.description ?? '');
		setBoardName(activity?.label ?? '');
		setConfirmRemove(false);
		setError('');
	}, [isOpen, question.statement, question.description, activity?.label]);

	const trimmed = title.trim();
	const busy = saving || removing;
	const canSave = !busy && trimmed.length > 0;

	const handleSave = async () => {
		if (!canSave) return;
		setSaving(true);
		setError('');
		try {
			await updateStatementFields(question.statementId, {
				statement: trimmed,
				description: description.trim(),
			});
			if (isLinked && boardName.trim() !== (activity?.label ?? '')) {
				await renameOrgActivity({
					organizationId: organizationId as string,
					statementId: question.statementId,
					label: boardName.trim() || undefined,
				});
			}
			onSaved();
		} catch (err) {
			logError(err, {
				operation: 'EditQuestionModal.save',
				statementId: question.statementId,
			});
			setError(t('Could not save the changes. Please try again.'));
		} finally {
			setSaving(false);
		}
	};

	const handleRemove = async () => {
		if (!isLinked || busy) return;
		setRemoving(true);
		setError('');
		try {
			await unlinkOrgStatement({
				organizationId: organizationId as string,
				statementId: question.statementId,
			});
			onUnlinked?.();
		} catch (err) {
			logError(err, {
				operation: 'EditQuestionModal.unlink',
				statementId: question.statementId,
			});
			setError(callableMessage(err, t('Could not remove the question. Please try again.')));
			setRemoving(false);
		}
	};

	return (
		<ModalFrame
			isOpen={isOpen}
			onClose={onClose}
			title={t('Edit question')}
			size="medium"
			footer={
				<>
					{isLinked &&
						(confirmRemove ? (
							<Button
								text={t('Yes, remove it')}
								variant="reject"
								disabled={busy}
								loading={removing}
								onClick={() => void handleRemove()}
							/>
						) : (
							<Button
								text={t('Remove from this organization')}
								variant="secondary"
								disabled={busy}
								onClick={() => setConfirmRemove(true)}
							/>
						))}
					<Button text={t('Cancel')} variant="secondary" onClick={onClose} disabled={busy} />
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
				{isLinked && (
					<Input
						label={t('Name on this board')}
						value={boardName}
						onChange={setBoardName}
						placeholder={question.statement}
						helperText={t('Only this organization sees this name. Participants keep the original.')}
						fullWidth
						autoFocus
						name="board-name"
					/>
				)}
				<Input
					label={isLinked ? t('Question title (participants see this)') : t('Question title')}
					value={title}
					onChange={setTitle}
					required
					fullWidth
					autoFocus={!isLinked}
					name="question-title"
				/>
				<Input
					as="textarea"
					label={t('Description (optional)')}
					value={description}
					onChange={setDescription}
					fullWidth
					rows={4}
					name="question-description"
				/>
				{confirmRemove && !error && (
					<p role="status">
						{t('The question stays where it is — only this organization loses access to it.')}
					</p>
				)}
				{error && <p role="alert">{error}</p>}
			</form>
		</ModalFrame>
	);
};

export default EditQuestionModal;

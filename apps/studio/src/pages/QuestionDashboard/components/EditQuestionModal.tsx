import { useEffect, useState, type FC } from 'react';
import type { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { Input } from '@/components/atomic/atoms/Input';
import { updateStatementFields } from '@/db/statements';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/** EditQuestionModal — rename the top question / edit its description. */
export interface EditQuestionModalProps {
	isOpen: boolean;
	question: Statement;
	onClose: () => void;
	onSaved: () => void;
}

const EditQuestionModal: FC<EditQuestionModalProps> = ({ isOpen, question, onClose, onSaved }) => {
	const { t } = useTranslation();
	const [title, setTitle] = useState(question.statement);
	const [description, setDescription] = useState(question.description ?? '');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	// Re-seed the form each time the modal opens.
	useEffect(() => {
		if (!isOpen) return;
		setTitle(question.statement);
		setDescription(question.description ?? '');
		setError('');
	}, [isOpen, question.statement, question.description]);

	const trimmed = title.trim();
	const canSave = !saving && trimmed.length > 0;

	const handleSave = async () => {
		if (!canSave) return;
		setSaving(true);
		setError('');
		try {
			await updateStatementFields(question.statementId, {
				statement: trimmed,
				description: description.trim(),
			});
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

	return (
		<ModalFrame
			isOpen={isOpen}
			onClose={onClose}
			title={t('Edit question')}
			size="medium"
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
				<Input
					label={t('Question title')}
					value={title}
					onChange={setTitle}
					required
					fullWidth
					autoFocus
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
				{error && <p role="alert">{error}</p>}
			</form>
		</ModalFrame>
	);
};

export default EditQuestionModal;

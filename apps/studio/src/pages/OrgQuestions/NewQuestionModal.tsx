import { useRef, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, Input } from '@/components/atomic/atoms';
import { createOrgStatement } from '@/db/orgFunctions';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './OrgQuestions.module.scss';

interface NewQuestionModalProps {
	organizationId: string;
	onClose: () => void;
	onCreated: (statementId: string) => void;
}

export default function NewQuestionModal({
	organizationId,
	onClose,
	onCreated,
}: NewQuestionModalProps) {
	const { t } = useTranslation();
	const titleRef = useRef<HTMLDivElement>(null);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const canSubmit = title.trim().length > 0 && !submitting;

	const handleCreate = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			const { statementId } = await createOrgStatement({
				organizationId,
				title: title.trim(),
				description: description.trim() || undefined,
				kind: 'topQuestion',
			});
			onCreated(statementId);
		} catch (err) {
			logError(err, { operation: 'NewQuestionModal.create', organizationId });
			setError(t('Could not create the question. Please try again.'));
			setSubmitting(false);
		}
	};

	return (
		<SimpleModal
			title={t('New question')}
			onClose={onClose}
			busy={submitting}
			size="medium"
			initialFocusRef={titleRef}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" disabled={submitting} onClick={onClose} />
					<Button
						text={t('Create question')}
						variant="primary"
						disabled={!canSubmit}
						loading={submitting}
						onClick={handleCreate}
					/>
				</>
			}
		>
			<form
				className={styles.form}
				onSubmit={(event) => {
					event.preventDefault();
					void handleCreate();
				}}
			>
				<div ref={titleRef} tabIndex={-1} className={styles.field}>
					<Input
						label={t('Main question')}
						value={title}
						onChange={setTitle}
						placeholder={t('e.g. How should we spend next year’s budget?')}
						required
						fullWidth
						autoFocus
						disabled={submitting}
					/>
				</div>
				<Input
					as="textarea"
					rows={3}
					label={t('A sentence for participants (optional)')}
					value={description}
					onChange={setDescription}
					helperText={t("This appears on participants' home screen once they join any activity.")}
					fullWidth
					disabled={submitting}
				/>
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
			</form>
		</SimpleModal>
	);
}

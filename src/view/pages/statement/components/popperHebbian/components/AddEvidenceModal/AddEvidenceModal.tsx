import React, { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { Statement } from '@freedi/shared-types';
import {
	createEvidencePost,
	updateEvidencePost,
} from '@/controllers/db/popperHebbian/evidenceController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './AddEvidenceModal.module.scss';
import { logError } from '@/utils/errorHandling';

interface AddEvidenceModalProps {
	parentStatementId: string;
	onClose: () => void;
	editingStatement?: Statement; // Optional: if provided, we're editing
}

const AddEvidenceModal: FC<AddEvidenceModalProps> = ({
	parentStatementId,
	onClose,
	editingStatement,
}) => {
	const { user } = useAuthentication();
	const { t } = useTranslation();
	const isEditMode = !!editingStatement;

	const [evidenceText, setEvidenceText] = useState(editingStatement?.statement || '');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (): Promise<void> => {
		if (!user || !evidenceText.trim()) return;

		setIsSubmitting(true);

		try {
			if (isEditMode && editingStatement) {
				// Update existing evidence - AI will re-classify support level
				await updateEvidencePost(editingStatement.statementId, evidenceText.trim());
			} else {
				// Create new evidence - AI will classify support level
				await createEvidencePost(parentStatementId, evidenceText.trim());
			}

			onClose();
		} catch (error) {
			logError(error, { operation: 'AddEvidenceModal.AddEvidenceModal.handleSubmit', metadata: { message: `Error ${isEditMode ? 'updating' : 'creating'} evidence post:` } });
		} finally {
			setIsSubmitting(false);
		}
	};

	const canSubmit = evidenceText.trim().length > 0 && !isSubmitting;

	return (
		<Modal
			closeModal={onClose}
			title={isEditMode ? t('Edit Evidence') : t('Add Claim, Comment or Evidence')}
		>
			<div className={styles.modalContainer}>
				<div className={styles.modalHeader}>
					<h2 className={styles.modalTitle}>
						{isEditMode ? t('Edit Evidence') : t('Add Claim, Comment or Evidence')}
					</h2>
					<button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
						×
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGroup}>
						<label htmlFor="evidence-text" className={styles.label}>
							{t('Your Contribution')}
						</label>
						<textarea
							id="evidence-text"
							className={styles.textarea}
							value={evidenceText}
							onChange={(e) => setEvidenceText(e.target.value)}
							placeholder={t('Share your claim, comment, or evidence...')}
							rows={8}
							disabled={isSubmitting}
						/>
					</div>

					<div className={styles.helperText}>
						<span className={styles.helperIcon}>🤖</span>
						{t('AI will automatically analyze your contribution and determine:')}
						<ul className={styles.helperList}>
							<li>{t('Whether it supports, challenges, or is neutral to the idea')}</li>
							<li>{t('The type of evidence (data, testimony, argument, anecdote, etc.)')}</li>
							<li>{t('Its weight in the discussion based on quality')}</li>
						</ul>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
						{t('Cancel')}
					</button>
					<button className={styles.submitButton} onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting
							? isEditMode
								? t('Updating...')
								: t('Submitting...')
							: isEditMode
								? t('Update')
								: t('Submit')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default AddEvidenceModal;

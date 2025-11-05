import React, { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { Statement } from 'delib-npm';
import { getSupportLabel } from '../../popperHebbianHelpers';
import { createEvidencePost, updateEvidencePost } from '@/controllers/db/popperHebbian/evidenceController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './AddEvidenceModal.module.scss';

interface AddEvidenceModalProps {
	parentStatementId: string;
	onClose: () => void;
	editingStatement?: Statement; // Optional: if provided, we're editing
}

const AddEvidenceModal: FC<AddEvidenceModalProps> = ({
	parentStatementId,
	onClose,
	editingStatement
}) => {
	const { user } = useAuthentication();
	const { t } = useTranslation();
	const isEditMode = !!editingStatement;

	const [evidenceText, setEvidenceText] = useState(
		editingStatement?.statement || ''
	);
	const [supportLevel, setSupportLevel] = useState(
		editingStatement?.evidence?.support || 0
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (): Promise<void> => {
		if (!user || !evidenceText.trim()) return;

		setIsSubmitting(true);

		try {
			if (isEditMode && editingStatement) {
				// Update existing evidence
				await updateEvidencePost(
					editingStatement.statementId,
					evidenceText.trim(),
					supportLevel
				);
			} else {
				// Create new evidence
				await createEvidencePost(
					parentStatementId,
					evidenceText.trim(),
					supportLevel
				);
			}

			onClose();
		} catch (error) {
			console.error(`Error ${isEditMode ? 'updating' : 'creating'} evidence post:`, error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSupportChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
		setSupportLevel(Number(e.target.value));
	};

	const canSubmit = evidenceText.trim().length > 0 && !isSubmitting;

	return (
		<Modal closeModal={onClose} title={isEditMode ? t('Edit Evidence') : t('Add Claim, Comment or Evidence')}>
			<div className={styles.modalContainer}>
				<div className={styles.modalHeader}>
					<h2 className={styles.modalTitle}>
						{isEditMode ? t('Edit Evidence') : t('Add Claim, Comment or Evidence')}
					</h2>
					<button
						className={styles.closeButton}
						onClick={onClose}
						aria-label="Close modal"
					>
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
							rows={5}
							disabled={isSubmitting}
						/>
					</div>

					<div className={styles.formGroup}>
						<label htmlFor="support-slider" className={styles.label}>
							{t('How does this relate to the idea?')}
						</label>
						<div className={styles.supportDisplay}>
							<span className={styles.supportLabel}>
								{getSupportLabel(supportLevel, t)}
							</span>
						</div>
						<div className={styles.sliderContainer}>
							<span className={styles.sliderLabelLeft}>{t('Strongly Challenges')}</span>
							<input
								id="support-slider"
								type="range"
								min="-1"
								max="1"
								step="0.1"
								value={supportLevel}
								onChange={handleSupportChange}
								className={styles.slider}
								disabled={isSubmitting}
							/>
							<span className={styles.sliderLabelRight}>{t('Strongly Supports')}</span>
						</div>
					</div>

					<div className={styles.helperText}>
						<span className={styles.helperIcon}>ℹ️</span>
						{t('AI will automatically classify your contribution (claim, comment, evidence type) and calculate its weight in the discussion.')}
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.cancelButton}
						onClick={onClose}
						disabled={isSubmitting}
					>
						{t('Cancel')}
					</button>
					<button
						className={styles.submitButton}
						onClick={handleSubmit}
						disabled={!canSubmit}
					>
						{isSubmitting
							? (isEditMode ? t('Updating...') : t('Submitting...'))
							: (isEditMode ? t('Update') : t('Submit'))
						}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default AddEvidenceModal;

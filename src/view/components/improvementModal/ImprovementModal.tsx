import React, { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import styles from './ImprovementModal.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface ImprovementModalProps {
	isOpen: boolean;
	onClose: () => void;
	onImprove: (instructions: string) => Promise<void>;
	isLoading: boolean;
	suggestionTitle: string;
}

const ImprovementModal: FC<ImprovementModalProps> = ({
	isOpen,
	onClose,
	onImprove,
	isLoading,
	suggestionTitle,
}) => {
	const { t } = useTranslation();
	const [instructions, setInstructions] = useState('');

	const handleImprove = async () => {
		await onImprove(instructions);
		setInstructions(''); // Clear instructions after submission
	};

	const handleClose = () => {
		if (!isLoading) {
			setInstructions(''); // Clear instructions when closing
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<Modal closeModal={handleClose} title={t('Improve Suggestion')}>
			<div className={styles.improvementModalBody}>
				<h2 className={styles.title}>{t('Improve Suggestion')}</h2>
				<p className={styles.suggestionTitle}>{suggestionTitle}</p>

				<div className={styles.instructions}>
					<label htmlFor="improvement-instructions" className={styles.label}>
						{t('How would you like to improve this suggestion?')}
					</label>
					<textarea
						id="improvement-instructions"
						className={styles.textarea}
						value={instructions}
						onChange={(e) => setInstructions(e.target.value)}
						placeholder={t('Enter improvement instructions (optional)')}
						rows={4}
						disabled={isLoading}
					/>
					<p className={styles.hint}>
						{t('Leave empty for automatic improvement')}
					</p>
				</div>

				<div className={styles.btns}>
					<button
						className={styles.btnSecondary}
						onClick={handleClose}
						disabled={isLoading}
					>
						{t('Cancel')}
					</button>
					<button
						className={`${styles.btnPrimary} ${isLoading ? styles.btnDisabled : ''}`}
						onClick={handleImprove}
						disabled={isLoading}
					>
						{isLoading ? t('Improving...') : t('Improve')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ImprovementModal;
import { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SummarizeModal.module.scss';

interface SummarizeModalProps {
	isOpen: boolean;
	onClose: () => void;
	onGenerate: (customPrompt: string) => Promise<void>;
	isLoading: boolean;
	questionTitle: string;
}

const SummarizeModal: FC<SummarizeModalProps> = ({
	isOpen,
	onClose,
	onGenerate,
	isLoading,
	questionTitle,
}) => {
	const { t } = useTranslation();
	const [customPrompt, setCustomPrompt] = useState('');

	const handleGenerate = async () => {
		await onGenerate(customPrompt);
		setCustomPrompt('');
	};

	const handleClose = () => {
		if (!isLoading) {
			setCustomPrompt('');
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<Modal closeModal={handleClose} title={t('Summarize Discussion')}>
			<div className={styles.summarizeModalBody}>
				<h2 className={styles.title}>{t('Generate Discussion Summary')}</h2>
				<p className={styles.questionTitle}>{questionTitle}</p>

				<div className={styles.instructions}>
					<label htmlFor="summary-prompt" className={styles.label}>
						{t('Custom instructions (optional)')}
					</label>
					<textarea
						id="summary-prompt"
						className={styles.textarea}
						value={customPrompt}
						onChange={(e) => setCustomPrompt(e.target.value)}
						placeholder={t('e.g., Focus on practical solutions, highlight consensus points...')}
						rows={4}
						disabled={isLoading}
					/>
					<p className={styles.hint}>{t('Leave empty for automatic summary of top suggestions')}</p>
				</div>

				<div className={styles.btns}>
					<button className={styles.btnSecondary} onClick={handleClose} disabled={isLoading}>
						{t('Cancel')}
					</button>
					<button
						className={`${styles.btnPrimary} ${isLoading ? styles.btnDisabled : ''}`}
						onClick={handleGenerate}
						disabled={isLoading}
					>
						{isLoading ? t('Generating...') : t('Generate Summary')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default SummarizeModal;

import React, { FC, useState } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './InitialIdeaModal.module.scss';

interface InitialIdeaModalProps {
	onSubmit: (idea: string) => void;
	onClose: () => void;
}

const InitialIdeaModal: FC<InitialIdeaModalProps> = ({ onSubmit, onClose }) => {
	const { t } = useTranslation();
	const [ideaText, setIdeaText] = useState('');

	const handleSubmit = (): void => {
		if (ideaText.trim()) {
			onSubmit(ideaText.trim());
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<Modal closeModal={onClose} title={t('Share Your Idea')}>
			<div className={styles.initialIdeaModal}>
				<div className={styles.modalHeader}>
					<div className={styles.headerIcon}>
						<span className={styles.iconEmoji}>💡</span>
					</div>
					<div className={styles.headerContent}>
						<h2 className={styles.modalTitle}>{t('Share Your Idea')}</h2>
						<p className={styles.modalSubtitle}>
							{t(
								'Tell us your initial idea or solution. The AI will help you refine it into a clear, testable proposal.',
							)}
						</p>
					</div>
				</div>

				<div className={styles.inputWrapper}>
					<div className={styles.inputSection}>
						<label htmlFor="idea-input" className={styles.label}>
							{t('Your Idea')}
							<span className={styles.required}>*</span>
						</label>
						<div className={styles.textareaWrapper}>
							<textarea
								id="idea-input"
								className={styles.textarea}
								value={ideaText}
								onChange={(e) => setIdeaText(e.target.value)}
								onKeyPress={handleKeyPress}
								placeholder={t('For example: We should go to the pool this weekend...')}
								rows={6}
								autoFocus
							/>
							<div className={styles.charCount}>
								{ideaText.length > 0 && (
									<span className={ideaText.length > 500 ? styles.charCountWarning : ''}>
										{ideaText.length} / 500
									</span>
								)}
							</div>
						</div>
						<p className={styles.helperText}>
							{t('Describe your idea in a few sentences. The AI will help you develop it further.')}
						</p>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={`${styles.button} ${styles.buttonSecondary}`}
						onClick={onClose}
						type="button"
					>
						{t('Cancel')}
					</button>
					<button
						className={`${styles.button} ${styles.buttonPrimary}`}
						onClick={handleSubmit}
						disabled={!ideaText.trim()}
						type="button"
					>
						<span>{t('Continue to Refinement')}</span>
						<span className={styles.buttonIcon}>→</span>
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default InitialIdeaModal;

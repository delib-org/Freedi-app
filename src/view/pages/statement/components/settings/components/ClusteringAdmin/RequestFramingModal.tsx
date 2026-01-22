import React, { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Framing } from '@freedi/shared-types';
import { requestCustomFraming } from '@/controllers/db/framing/framingController';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import styles from './ClusteringAdmin.module.scss';
import Loader from '@/view/components/loaders/Loader';

interface RequestFramingModalProps {
	statementId: string;
	onClose: () => void;
	onFramingCreated: (framing: Framing) => void;
}

const RequestFramingModal: FC<RequestFramingModalProps> = ({
	statementId,
	onClose,
	onFramingCreated,
}) => {
	const { t } = useTranslation();
	const creator = useAppSelector(creatorSelector);

	const [customPrompt, setCustomPrompt] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!customPrompt.trim()) {
			setError(t('Please enter a custom prompt'));

			return;
		}

		if (!creator?.uid) {
			setError(t('You must be logged in'));

			return;
		}

		try {
			setIsSubmitting(true);
			setError(null);

			const newFraming = await requestCustomFraming(
				statementId,
				customPrompt.trim(),
				creator.uid
			);

			onFramingCreated(newFraming);
		} catch (err) {
			logError(err, {
				operation: 'RequestFramingModal.handleSubmit',
				userId: creator?.uid,
				statementId,
				metadata: { customPrompt },
			});
			setError(t('Failed to create custom framing'));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	return (
		<div className={styles.modalBackdrop} onClick={handleBackdropClick}>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<h3>{t('Request Custom Framing')}</h3>
					<button
						className={styles.closeBtn}
						onClick={onClose}
						aria-label={t('Close')}
					>
						×
					</button>
				</div>

				<form onSubmit={handleSubmit}>
					<div className={styles.modalBody}>
						<p className={styles.modalDescription}>
							{t(
								'Describe how you want the AI to cluster the options. For example: "Group by implementation cost" or "Organize by timeframe"'
							)}
						</p>

						<label className={styles.inputLabel} htmlFor="custom-prompt">
							{t('Custom Clustering Perspective')}
						</label>
						<textarea
							id="custom-prompt"
							className={styles.textArea}
							value={customPrompt}
							onChange={(e) => setCustomPrompt(e.target.value)}
							placeholder={t(
								'e.g., "Cluster these options based on their environmental impact..."'
							)}
							rows={4}
							disabled={isSubmitting}
						/>

						{error && <div className={styles.modalError}>{error}</div>}
					</div>

					<div className={styles.modalFooter}>
						<button
							type="button"
							className="btn btn--secondary"
							onClick={onClose}
							disabled={isSubmitting}
						>
							{t('Cancel')}
						</button>
						<button
							type="submit"
							className="btn btn--primary"
							disabled={isSubmitting || !customPrompt.trim()}
						>
							{isSubmitting ? (
								<>
									<Loader />
									<span>{t('Creating...')}</span>
								</>
							) : (
								t('Create Framing')
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default RequestFramingModal;

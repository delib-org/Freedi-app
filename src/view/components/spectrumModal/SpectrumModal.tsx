import React, { FC, useState, useEffect } from 'react';
import Modal from '@/view/components/modal/Modal';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { SpectrumSettings, DEFAULT_SPECTRUM_LABELS, DEFAULT_SPECTRUM_QUESTION } from '@/types/spectrumSettings';
import styles from './SpectrumModal.module.scss';

interface SpectrumModalProps {
	spectrumSettings?: SpectrumSettings | null;
	onSubmit: (spectrum: number) => void;
	onClose: () => void;
	isLoading?: boolean;
	initialValue?: number;
}

const SpectrumModal: FC<SpectrumModalProps> = ({
	spectrumSettings,
	onSubmit,
	onClose,
	isLoading = false,
	initialValue = 3,
}) => {
	const { t } = useTranslation();
	const [spectrum, setSpectrum] = useState<number>(initialValue);

	// Get labels and question from settings or use defaults
	const labels = spectrumSettings?.labels || DEFAULT_SPECTRUM_LABELS;
	const questionText = spectrumSettings?.questionText || DEFAULT_SPECTRUM_QUESTION;

	// Get the current label based on spectrum value
	const currentLabel = labels[spectrum - 1] || '';

	useEffect(() => {
		// Update spectrum if initialValue changes
		setSpectrum(initialValue);
	}, [initialValue]);

	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSpectrum(parseInt(e.target.value, 10));
	};

	const handleSubmit = () => {
		onSubmit(spectrum);
	};

	const handleModalClose = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!isLoading) {
			onClose();
		}
	};

	return (
		<Modal closeModal={handleModalClose} title={t('Position on the Spectrum')}>
			<div className={styles['spectrum-modal']}>
				<div className={styles['spectrum-modal__header']}>
					<h2>{t('Position on the Spectrum')}</h2>
					<p>{t(questionText)}</p>
				</div>

				<div className={styles['spectrum-modal__slider-container']}>
					<div className={styles['spectrum-modal__slider-track']}>
						<input
							type="range"
							min={1}
							max={5}
							step={1}
							value={spectrum}
							onChange={handleSliderChange}
							className={styles['spectrum-modal__slider']}
							aria-label={t('Spectrum position')}
							disabled={isLoading}
						/>
					</div>

					<div className={styles['spectrum-modal__labels']}>
						{labels.map((label, index) => (
							<span
								key={index}
								className={`${styles['spectrum-modal__label']} ${
									spectrum === index + 1 ? styles['spectrum-modal__label--active'] : ''
								}`}
							>
								{t(label)}
							</span>
						))}
					</div>
				</div>

				<div className={styles['spectrum-modal__value-display']}>
					<span>{spectrum}</span>
					<p>{t(currentLabel)}</p>
				</div>

				<div className={styles['spectrum-modal__privacy-note']}>
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
					</svg>
					<span>{t('Used anonymously to create diverse groups')}</span>
				</div>

				<div className={styles['spectrum-modal__actions']}>
					<Button
						text={t('Cancel')}
						buttonType={ButtonType.SECONDARY}
						onClick={onClose}
						disabled={isLoading}
						type="button"
					/>
					<Button
						text={isLoading ? t('Joining...') : t('Join Discussion')}
						buttonType={ButtonType.PRIMARY}
						onClick={handleSubmit}
						disabled={isLoading}
						type="button"
					/>
				</div>
			</div>
		</Modal>
	);
};

export default SpectrumModal;

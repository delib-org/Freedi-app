import { useEffect, useState } from 'react';
import styles from './SuggestionLoader.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface SuggestionLoaderProps {
	show: boolean;
	messages?: string[];
	messageInterval?: number;
	variant?: 'modern' | 'minimal';
}

const SuggestionLoader = ({
	show,
	messages,
	messageInterval = 2500,
	variant = 'modern',
}: SuggestionLoaderProps) => {
	const { t } = useTranslation();
	const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

	// Default messages with progressive disclosure about what's happening
	const defaultMessages = [
		t('Analyzing your suggestion...'),
		t('Finding similar ideas from the community...'),
		t('Grouping related suggestions together...'),
		t('Preparing your results...'),
	];

	const displayMessages = messages || defaultMessages;

	// Icons for each step (using emoji for simplicity)
	const stepIcons = ['🔍', '👥', '📊', '✨'];

	useEffect(() => {
		if (!show) {
			setCurrentMessageIndex(0);

			return;
		}

		const interval = setInterval(() => {
			setCurrentMessageIndex((prev) => (prev < displayMessages.length - 1 ? prev + 1 : prev));
		}, messageInterval);

		return () => clearInterval(interval);
	}, [show, displayMessages.length, messageInterval]);

	if (!show) return null;

	if (variant === 'minimal') {
		return (
			<div className={styles.loaderOverlay} role="status" aria-live="polite">
				<div className={styles.loaderContainerMinimal}>
					<div className={styles.spinnerContainer}>
						<div className={styles.spinner}></div>
					</div>
					<h2 className={styles.minimalMessage}>{displayMessages[currentMessageIndex]}</h2>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.loaderOverlay} role="status" aria-live="polite">
			<div className={styles.loaderContainer}>
				{/* Icon display for current step */}
				<div className={styles.iconDisplay}>
					<span className={styles.stepIcon}>{stepIcons[currentMessageIndex] || '⚡'}</span>
				</div>

				{/* Modern animated loader with three dots */}
				<div className={styles.dotsLoader}>
					<span className={styles.dot}></span>
					<span className={styles.dot}></span>
					<span className={styles.dot}></span>
				</div>

				{/* Progress indicator */}
				<div className={styles.progressBar}>
					<div
						className={styles.progressFill}
						style={{
							width: `${((currentMessageIndex + 1) / displayMessages.length) * 100}%`,
						}}
					/>
				</div>

				{/* Message display with smooth transitions */}
				<div className={styles.messageContainer}>
					<h2 className={styles.mainMessage}>{displayMessages[currentMessageIndex]}</h2>
					<p className={styles.subMessage}>{t('This may take a few moments')}</p>
				</div>

				{/* Step indicators with icons */}
				<div className={styles.stepIndicators}>
					{displayMessages.map((_, index) => (
						<div
							key={index}
							className={`${styles.stepIndicatorItem} ${
								index <= currentMessageIndex ? styles.active : ''
							}`}
						>
							<span className={styles.miniIcon}>{stepIcons[index] || '•'}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default SuggestionLoader;

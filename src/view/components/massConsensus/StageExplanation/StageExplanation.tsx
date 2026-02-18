import React, { FC, useState, useEffect, useCallback } from 'react';
import { ExplanationConfig } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './StageExplanation.module.scss';
import X from '@/assets/icons/x.svg?react';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';

const STORAGE_KEY_SEEN = 'freedi_explanations_seen';
const STORAGE_KEY_DISABLED = 'freedi_explanations_disabled';

// Helper functions for localStorage
const getSeenExplanations = (): string[] => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY_SEEN);

		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
};

const markExplanationAsSeen = (stageId: string): void => {
	try {
		const seen = getSeenExplanations();
		if (!seen.includes(stageId)) {
			seen.push(stageId);
			localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(seen));
		}
	} catch {
		// Ignore localStorage errors
	}
};

const getExplanationsDisabled = (): boolean => {
	try {
		return localStorage.getItem(STORAGE_KEY_DISABLED) === 'true';
	} catch {
		return false;
	}
};

const setExplanationsDisabled = (disabled: boolean): void => {
	try {
		localStorage.setItem(STORAGE_KEY_DISABLED, String(disabled));
	} catch {
		// Ignore localStorage errors
	}
};

interface StageExplanationProps {
	stageId: string;
	explanation: ExplanationConfig;
	onDismiss?: () => void;
	className?: string;
}

export const StageExplanation: FC<StageExplanationProps> = ({
	stageId,
	explanation,
	onDismiss,
	className,
}) => {
	const { t, dir } = useTranslation();

	const [isVisible, setIsVisible] = useState(true);
	const [isDismissing, setIsDismissing] = useState(false);

	// Check if explanations are disabled or already seen
	const shouldShow = useCallback(() => {
		if (getExplanationsDisabled()) return false;
		if (explanation.showOnlyFirstTime && getSeenExplanations().includes(stageId)) return false;

		return true;
	}, [stageId, explanation.showOnlyFirstTime]);

	useEffect(() => {
		if (!explanation || !shouldShow()) {
			setIsVisible(false);

			return;
		}

		// Mark as seen
		markExplanationAsSeen(stageId);

		// Auto-dismiss if duration is set
		if (explanation.displayDuration && explanation.displayDuration > 0) {
			const timer = setTimeout(() => {
				handleDismiss();
			}, explanation.displayDuration);

			return () => clearTimeout(timer);
		}
	}, [stageId, explanation, shouldShow]);

	if (!explanation || !explanation.enabled || !isVisible) {
		return null;
	}

	const handleDismiss = () => {
		setIsDismissing(true);
		setTimeout(() => {
			setIsVisible(false);
			onDismiss?.();
		}, 300); // Animation duration
	};

	const handleDontShowAgain = () => {
		setExplanationsDisabled(true);
		handleDismiss();
	};

	const renderContent = () => {
		const displayMode = explanation.displayMode || 'card';

		switch (displayMode) {
			case 'card':
				return (
					<div
						className={`${styles.explanationCard} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
						style={{ direction: dir }}
					>
						<div className={styles.cardHeader}>
							<div className={styles.iconWrapper}>
								<InfoIcon />
							</div>
							{explanation.title && <h3 className={styles.title}>{t(explanation.title)}</h3>}
							{explanation.dismissible !== false && (
								<button
									className={styles.closeButton}
									onClick={handleDismiss}
									aria-label={t('Close')}
								>
									<X />
								</button>
							)}
						</div>
						<div className={styles.cardContent}>
							<p>{t(explanation.content)}</p>
						</div>
						{explanation.showOnlyFirstTime && (
							<div className={styles.cardFooter}>
								<button className={styles.dontShowButton} onClick={handleDontShowAgain}>
									{t("Don't show explanations again")}
								</button>
							</div>
						)}
					</div>
				);

			case 'inline':
				return (
					<div
						className={`${styles.explanationInline} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
						style={{ direction: dir }}
					>
						<div className={styles.inlineContent}>
							<InfoIcon className={styles.inlineIcon} />
							<p>{t(explanation.content)}</p>
							{explanation.dismissible !== false && (
								<button
									className={styles.inlineClose}
									onClick={handleDismiss}
									aria-label={t('Close')}
								>
									<X />
								</button>
							)}
						</div>
					</div>
				);

			case 'tooltip':
				return (
					<div
						className={`${styles.explanationTooltip} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
						style={{ direction: dir }}
					>
						<div className={styles.tooltipArrow} />
						<div className={styles.tooltipContent}>
							<p>{t(explanation.content)}</p>
						</div>
					</div>
				);

			case 'modal':
				return (
					<div className={`${styles.explanationModal} ${isDismissing ? styles.dismissing : ''}`}>
						<div className={styles.modalBackdrop} onClick={handleDismiss} />
						<div className={styles.modalContent} style={{ direction: dir }}>
							<div className={styles.modalHeader}>
								{explanation.title && <h2>{t(explanation.title)}</h2>}
								<button
									className={styles.modalClose}
									onClick={handleDismiss}
									aria-label={t('Close')}
								>
									<X />
								</button>
							</div>
							<div className={styles.modalBody}>
								<p>{t(explanation.content)}</p>
							</div>
							<div className={styles.modalFooter}>
								{explanation.showOnlyFirstTime && (
									<button className={styles.dontShowButton} onClick={handleDontShowAgain}>
										{t("Don't show again")}
									</button>
								)}
								<button
									className={`btn btn--primary ${styles.modalOkButton}`}
									onClick={handleDismiss}
								>
									{t('Got it')}
								</button>
							</div>
						</div>
					</div>
				);

			case 'toast':
				return (
					<div
						className={`${styles.explanationToast} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
						style={{ direction: dir }}
					>
						<InfoIcon className={styles.toastIcon} />
						<p>{t(explanation.content)}</p>
						{explanation.dismissible !== false && (
							<button className={styles.toastClose} onClick={handleDismiss} aria-label={t('Close')}>
								<X />
							</button>
						)}
					</div>
				);

			case 'banner':
				return (
					<div
						className={`${styles.explanationBanner} ${isDismissing ? styles.dismissing : ''} ${className || ''}`}
						style={{ direction: dir }}
					>
						<div className={styles.bannerContent}>
							<InfoIcon className={styles.bannerIcon} />
							{explanation.title && (
								<strong className={styles.bannerTitle}>{t(explanation.title)}</strong>
							)}
							<span className={styles.bannerText}>{t(explanation.content)}</span>
							{explanation.dismissible !== false && (
								<button
									className={styles.bannerClose}
									onClick={handleDismiss}
									aria-label={t('Close')}
								>
									<X />
								</button>
							)}
						</div>
					</div>
				);

			default:
				return null;
		}
	};

	return renderContent();
};

export default StageExplanation;

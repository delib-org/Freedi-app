import React, { FC, useMemo } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { IntegrationPreviewProps } from '@/types/integration';
import styles from './IntegrateSuggestions.module.scss';

// Icon components
const MergeIcon: FC = () => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="18" cy="18" r="3" />
		<circle cx="6" cy="6" r="3" />
		<path d="M6 21V9a9 9 0 0 0 9 9" />
	</svg>
);

const WarningTriangle: FC = () => (
	<svg
		width="12"
		height="12"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<line x1="12" y1="17" x2="12.01" y2="17" />
	</svg>
);

const IntegrationPreview: FC<IntegrationPreviewProps> = ({
	selectedStatements,
	suggestedTitle,
	suggestedDescription,
	onTitleChange,
	onDescriptionChange,
	onBack,
	onConfirm,
	isSubmitting,
}) => {
	const { t } = useTranslation();

	// Calculate totals using useMemo for performance
	const totalEvaluators = useMemo(() => {
		return selectedStatements.reduce((sum, s) => sum + s.numberOfEvaluators, 0);
	}, [selectedStatements]);

	// Character counts
	const titleLength = suggestedTitle.length;
	const descriptionLength = suggestedDescription.length;
	const maxTitleLength = 200;
	const maxDescriptionLength = 1000;

	// Button state
	const isConfirmDisabled = isSubmitting || !suggestedTitle.trim();
	const buttonClasses = [
		styles.integrateSuggestions__button,
		styles['integrateSuggestions__button--primary'],
		isSubmitting ? styles['integrateSuggestions__button--loading'] : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={styles.preview}>
			{/* Selected statements summary card */}
			<div className={styles.preview__section}>
				<h3 className={styles.preview__sectionTitle}>{t('Suggestions Being Merged')}</h3>
				<div className={styles.preview__summaryCard}>
					<div className={styles.preview__summaryHeader}>
						<span className={styles.preview__summaryTitle}>
							<MergeIcon /> {t('Selected Items')}
						</span>
						<span className={styles.preview__summaryBadge}>
							{selectedStatements.length} {t('items')}
						</span>
					</div>
					<div className={styles.preview__list}>
						{selectedStatements.map((statement) => (
							<div key={statement.statementId} className={styles.preview__listItem}>
								<span className={styles.preview__itemTitle}>{statement.statement}</span>
								<span className={styles.preview__itemMeta}>
									{statement.numberOfEvaluators} {t('eval')}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Edit integrated suggestion form */}
			<div className={styles.preview__section}>
				<h3 className={styles.preview__sectionTitle}>{t('New Integrated Suggestion')}</h3>
				<div className={styles.preview__editCard}>
					{/* Title field */}
					<div className={styles.preview__field}>
						<label htmlFor="integrated-title" className={styles.preview__label}>
							{t('Title')}
							<span className={styles.preview__labelRequired}>*</span>
						</label>
						<input
							id="integrated-title"
							type="text"
							value={suggestedTitle}
							onChange={(e) => onTitleChange(e.target.value)}
							className={styles.preview__input}
							placeholder={t('Enter a clear, concise title')}
							maxLength={maxTitleLength}
							disabled={isSubmitting}
							autoFocus
						/>
						<span className={styles.preview__inputHint}>
							{titleLength}/{maxTitleLength}
						</span>
					</div>

					{/* Description field */}
					<div className={styles.preview__field}>
						<label htmlFor="integrated-description" className={styles.preview__label}>
							{t('Description')}
							<span className={styles.preview__labelOptional}>({t('optional')})</span>
						</label>
						<textarea
							id="integrated-description"
							value={suggestedDescription}
							onChange={(e) => onDescriptionChange(e.target.value)}
							className={styles.preview__textarea}
							placeholder={t('Add additional context or details')}
							rows={4}
							maxLength={maxDescriptionLength}
							disabled={isSubmitting}
						/>
						<span className={styles.preview__inputHint}>
							{descriptionLength}/{maxDescriptionLength}
						</span>
					</div>
				</div>
			</div>

			{/* Warning notice */}
			<div className={styles.preview__warning}>
				<div className={styles.preview__warningIcon}>
					<WarningTriangle />
				</div>
				<div className={styles.preview__warningContent}>
					<p className={styles.preview__warningTitle}>{t('Important Notice')}</p>
					<p className={styles.preview__warningText}>
						{t(
							'The original suggestions will be hidden after integration. All evaluations will be transferred to the new integrated suggestion.',
						)}
					</p>
				</div>
			</div>

			{/* Total summary */}
			<div className={styles.preview__totalSummary}>
				<div className={styles.preview__totalContent}>
					<div className={styles.preview__totalItem}>
						<span className={styles.preview__totalValue}>{selectedStatements.length}</span>
						<span className={styles.preview__totalLabel}>{t('Suggestions')}</span>
					</div>
					<div className={styles.preview__totalDivider} />
					<div className={styles.preview__totalItem}>
						<span className={styles.preview__totalValue}>
							{t('Up to')} {totalEvaluators}
						</span>
						<span className={styles.preview__totalLabel}>{t('Evaluators')}</span>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className={styles.preview__actions}>
				<button
					type="button"
					onClick={onBack}
					disabled={isSubmitting}
					className={`${styles.integrateSuggestions__button} ${styles['integrateSuggestions__button--secondary']}`}
				>
					{t('Back')}
				</button>
				<button
					type="button"
					onClick={onConfirm}
					disabled={isConfirmDisabled}
					className={buttonClasses}
				>
					{isSubmitting ? <span>{t('Integrating')}</span> : <span>{t('Confirm Integration')}</span>}
				</button>
			</div>
		</div>
	);
};

export default IntegrationPreview;

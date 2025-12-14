import React, { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { IntegrationPreviewProps } from '@/types/integration';
import styles from './IntegrateSuggestions.module.scss';

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

	// Calculate totals
	const totalEvaluators = selectedStatements.reduce(
		(sum, s) => sum + s.numberOfEvaluators,
		0
	);

	return (
		<div className={styles.preview}>
			{/* Selected statements summary */}
			<div className={styles.preview__section}>
				<h3 className={styles.preview__sectionTitle}>
					{t('Integrating')} {selectedStatements.length} {t('suggestions')}
				</h3>
				<div className={styles.preview__list}>
					{selectedStatements.map(statement => (
						<div key={statement.statementId} className={styles.preview__item}>
							<span className={styles.preview__itemTitle}>{statement.statement}</span>
							<span className={styles.preview__itemMeta}>
								({statement.numberOfEvaluators} {t('evaluators')})
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Edit integrated suggestion */}
			<div className={styles.preview__section}>
				<h3 className={styles.preview__sectionTitle}>{t('Integrated Suggestion')}</h3>

				<div className={styles.preview__field}>
					<label htmlFor="integrated-title" className={styles.preview__label}>
						{t('Title')}
					</label>
					<input
						id="integrated-title"
						type="text"
						value={suggestedTitle}
						onChange={(e) => onTitleChange(e.target.value)}
						className={styles.preview__input}
						placeholder={t('Enter title')}
						maxLength={200}
						disabled={isSubmitting}
					/>
				</div>

				<div className={styles.preview__field}>
					<label htmlFor="integrated-description" className={styles.preview__label}>
						{t('Description')}
					</label>
					<textarea
						id="integrated-description"
						value={suggestedDescription}
						onChange={(e) => onDescriptionChange(e.target.value)}
						className={styles.preview__textarea}
						placeholder={t('Enter description (optional)')}
						rows={3}
						maxLength={1000}
						disabled={isSubmitting}
					/>
				</div>
			</div>

			{/* Warning */}
			<div className={styles.preview__warning}>
				<span className={styles.preview__warningIcon}>&#9888;</span>
				<span>{t('Original suggestions will be hidden')}</span>
			</div>

			{/* Summary */}
			<div className={styles.preview__summary}>
				<span>
					{t('Total')}: {totalEvaluators} {t('evaluators')}
				</span>
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
					disabled={isSubmitting || !suggestedTitle.trim()}
					className={`${styles.integrateSuggestions__button} ${styles['integrateSuggestions__button--primary']}`}
				>
					{isSubmitting ? t('Integrating...') : t('Confirm Integration')}
				</button>
			</div>
		</div>
	);
};

export default IntegrationPreview;

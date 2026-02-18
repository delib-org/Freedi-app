import React, { FC, useState, useEffect, useCallback, useMemo } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	findSimilarForIntegration,
	executeIntegration,
} from '@/controllers/db/integration/integrationController';
import { logError } from '@/utils/errorHandling';
import type {
	IntegrateSuggestionsModalProps,
	IntegrationStep,
	StatementWithEvaluation,
} from '@/types/integration';
import SimilarGroupSelector from './SimilarGroupSelector';
import IntegrationPreview from './IntegrationPreview';
import styles from './IntegrateSuggestions.module.scss';

// SVG Icons as components for better visuals
const CheckIcon: FC = () => (
	<svg
		width="32"
		height="32"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="3"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="20 6 9 17 4 12" />
	</svg>
);

const ErrorIcon: FC = () => (
	<svg
		width="28"
		height="28"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="8" x2="12" y2="12" />
		<line x1="12" y1="16" x2="12.01" y2="16" />
	</svg>
);

const WarningIcon: FC = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 2L1 21h22L12 2zm0 3.83L19.13 19H4.87L12 5.83zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
	</svg>
);

const IntegrateSuggestionsModal: FC<IntegrateSuggestionsModalProps> = ({
	sourceStatementId,
	parentStatementId,
	onClose,
	onSuccess,
}) => {
	const { t } = useTranslation();
	const [step, setStep] = useState<IntegrationStep>('loading');
	const [error, setError] = useState<string | null>(null);

	// Data from API
	const [sourceStatement, setSourceStatement] = useState<StatementWithEvaluation | null>(null);
	const [similarStatements, setSimilarStatements] = useState<StatementWithEvaluation[]>([]);

	// User selections
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [integratedTitle, setIntegratedTitle] = useState('');
	const [integratedDescription, setIntegratedDescription] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [migratedEvaluatorsCount, setMigratedEvaluatorsCount] = useState(0);

	// Load similar statements
	useEffect(() => {
		const loadSimilar = async () => {
			try {
				setStep('loading');
				setError(null);

				const result = await findSimilarForIntegration(sourceStatementId);

				setSourceStatement(result.sourceStatement);
				setSimilarStatements(result.similarStatements);

				// Pre-select the source statement
				setSelectedIds([result.sourceStatement.statementId]);

				// Set suggested integration text
				if (result.suggestedTitle) {
					setIntegratedTitle(result.suggestedTitle);
				} else {
					setIntegratedTitle(result.sourceStatement.statement);
				}

				if (result.suggestedDescription) {
					setIntegratedDescription(result.suggestedDescription);
				} else {
					setIntegratedDescription(result.sourceStatement.description || '');
				}

				if (result.similarStatements.length === 0) {
					setError(t('No similar suggestions found'));
					setStep('error');
				} else {
					setStep('selection');
				}
			} catch (err) {
				logError(err, {
					operation: 'IntegrateSuggestionsModal.loadSimilar',
					statementId: sourceStatementId,
				});
				setError(t('Failed to find similar suggestions'));
				setStep('error');
			}
		};

		loadSimilar();
	}, [sourceStatementId, t]);

	// Handle selection changes
	const handleSelectionChange = useCallback((ids: string[]) => {
		setSelectedIds(ids);
	}, []);

	// Get selected statements for preview
	const getSelectedStatements = useCallback((): StatementWithEvaluation[] => {
		const all = sourceStatement ? [sourceStatement, ...similarStatements] : similarStatements;

		return all.filter((s) => selectedIds.includes(s.statementId));
	}, [sourceStatement, similarStatements, selectedIds]);

	// Move to preview step
	const handleNext = useCallback(() => {
		if (selectedIds.length < 2) {
			setError(t('Select at least 2 suggestions to integrate'));

			return;
		}
		setError(null);
		setStep('preview');
	}, [selectedIds, t]);

	// Go back to selection
	const handleBack = useCallback(() => {
		setStep('selection');
	}, []);

	// Execute integration
	const handleConfirm = useCallback(async () => {
		if (!integratedTitle.trim()) {
			setError(t('Title is required'));

			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const result = await executeIntegration({
				parentStatementId,
				selectedStatementIds: selectedIds,
				integratedTitle: integratedTitle.trim(),
				integratedDescription: integratedDescription.trim(),
			});

			if (result.success) {
				console.info('Integration result:', result);
				console.info('Migrated evaluators count:', result.migratedEvaluationsCount);
				setMigratedEvaluatorsCount(result.migratedEvaluationsCount);
				setStep('success');
				setTimeout(() => {
					onSuccess(result.newStatementId);
				}, 1500);
			} else {
				setError(t('Integration failed'));
			}
		} catch (err) {
			logError(err, {
				operation: 'IntegrateSuggestionsModal.handleConfirm',
				statementId: parentStatementId,
				metadata: {
					selectedStatementIds: selectedIds,
				},
			});
			setError(t('Failed to integrate suggestions'));
		} finally {
			setIsSubmitting(false);
		}
	}, [integratedTitle, integratedDescription, parentStatementId, selectedIds, onSuccess, t]);

	// Calculate total evaluators using useMemo for performance
	const totalEvaluators = useMemo(() => {
		return getSelectedStatements().reduce((sum, s) => sum + s.numberOfEvaluators, 0);
	}, [getSelectedStatements]);

	// Get step information for step indicator
	const getStepStatus = useCallback(
		(stepName: IntegrationStep) => {
			const stepOrder: IntegrationStep[] = ['loading', 'selection', 'preview', 'success'];
			const currentIndex = stepOrder.indexOf(step);
			const stepIndex = stepOrder.indexOf(stepName);

			if (stepIndex < currentIndex) return 'completed';
			if (stepIndex === currentIndex) return 'active';

			return 'pending';
		},
		[step],
	);

	return (
		<Modal closeModal={onClose} title={t('Integrate Similar Suggestions')}>
			<div className={styles.integrateSuggestions}>
				{/* Header with gradient background */}
				<div className={styles.integrateSuggestions__header}>
					<h2>{t('Integrate Similar Suggestions')}</h2>
					{step !== 'loading' && step !== 'error' && step !== 'success' && (
						<p className={styles.integrateSuggestions__subtitle}>
							{step === 'selection'
								? t('Select suggestions to integrate')
								: t('Review and edit the integrated suggestion')}
						</p>
					)}
				</div>

				{/* Step Indicator */}
				{step !== 'loading' && step !== 'error' && (
					<div className={styles.integrateSuggestions__steps}>
						<div
							className={`${styles.integrateSuggestions__step} ${styles[`integrateSuggestions__step--${getStepStatus('selection')}`]}`}
						>
							<span className={styles.integrateSuggestions__stepNumber}>
								{getStepStatus('selection') === 'completed' ? '✓' : '1'}
							</span>
							<span>{t('Select')}</span>
						</div>
						<div
							className={`${styles.integrateSuggestions__stepDivider} ${styles[`integrateSuggestions__stepDivider--${getStepStatus('preview')}`]}`}
						/>
						<div
							className={`${styles.integrateSuggestions__step} ${styles[`integrateSuggestions__step--${getStepStatus('preview')}`]}`}
						>
							<span className={styles.integrateSuggestions__stepNumber}>
								{getStepStatus('preview') === 'completed' ? '✓' : '2'}
							</span>
							<span>{t('Preview')}</span>
						</div>
						<div
							className={`${styles.integrateSuggestions__stepDivider} ${styles[`integrateSuggestions__stepDivider--${getStepStatus('success')}`]}`}
						/>
						<div
							className={`${styles.integrateSuggestions__step} ${styles[`integrateSuggestions__step--${getStepStatus('success')}`]}`}
						>
							<span className={styles.integrateSuggestions__stepNumber}>
								{getStepStatus('success') === 'completed' ? '✓' : '3'}
							</span>
							<span>{t('Done')}</span>
						</div>
					</div>
				)}

				{/* Content based on step */}
				<div className={styles.integrateSuggestions__content}>
					{/* Loading State with enhanced spinner */}
					{step === 'loading' && (
						<div className={styles.integrateSuggestions__loading}>
							<div className={styles.integrateSuggestions__loadingSpinner}>
								<div className={styles.integrateSuggestions__loadingRing} />
								<div className={styles.integrateSuggestions__loadingRing} />
							</div>
							<p>{t('Finding similar suggestions')}</p>
							<div className={styles.integrateSuggestions__loadingText}>
								<span className={styles.integrateSuggestions__loadingDot} />
								<span className={styles.integrateSuggestions__loadingDot} />
								<span className={styles.integrateSuggestions__loadingDot} />
							</div>
						</div>
					)}

					{/* Error State with improved visuals */}
					{step === 'error' && (
						<div className={styles.integrateSuggestions__error}>
							<div className={styles.integrateSuggestions__errorIcon}>
								<ErrorIcon />
							</div>
							<h3 className={styles.integrateSuggestions__errorTitle}>
								{t('Unable to find similar suggestions')}
							</h3>
							<p className={styles.integrateSuggestions__errorMessage}>
								{error || t('Please try again later')}
							</p>
							<button
								type="button"
								onClick={onClose}
								className={`${styles.integrateSuggestions__button} ${styles['integrateSuggestions__button--secondary']}`}
							>
								{t('Close')}
							</button>
						</div>
					)}

					{/* Selection Step */}
					{step === 'selection' && sourceStatement && (
						<SimilarGroupSelector
							sourceStatement={sourceStatement}
							similarStatements={similarStatements}
							selectedIds={selectedIds}
							onSelectionChange={handleSelectionChange}
						/>
					)}

					{/* Preview Step */}
					{step === 'preview' && (
						<IntegrationPreview
							selectedStatements={getSelectedStatements()}
							suggestedTitle={integratedTitle}
							suggestedDescription={integratedDescription}
							onTitleChange={setIntegratedTitle}
							onDescriptionChange={setIntegratedDescription}
							onBack={handleBack}
							onConfirm={handleConfirm}
							isSubmitting={isSubmitting}
						/>
					)}

					{/* Success State with animation */}
					{step === 'success' && (
						<div className={styles.integrateSuggestions__success}>
							<div className={styles.integrateSuggestions__successIcon}>
								<CheckIcon />
							</div>
							<h3 className={styles.integrateSuggestions__successTitle}>
								{t('Integration Complete')}
							</h3>
							<p className={styles.integrateSuggestions__successDetails}>
								{t('Successfully merged')} {selectedIds.length} {t('suggestions')}
							</p>
							<div className={styles.integrateSuggestions__successBadge}>
								<span>{migratedEvaluatorsCount}</span>
								<span>{t('evaluators migrated')}</span>
							</div>
						</div>
					)}
				</div>

				{/* Error Banner for inline errors */}
				{error && step !== 'error' && (
					<div className={styles.integrateSuggestions__errorBanner}>
						<span className={styles.integrateSuggestions__errorBannerIcon}>
							<WarningIcon />
						</span>
						<p className={styles.integrateSuggestions__errorBannerText}>{error}</p>
					</div>
				)}

				{/* Footer with actions - Selection step */}
				{step === 'selection' && (
					<div className={styles.integrateSuggestions__footer}>
						<div className={styles.integrateSuggestions__summary}>
							<div className={styles.integrateSuggestions__summaryMain}>
								<span>{selectedIds.length}</span>
								<span>{t('suggestions selected')}</span>
							</div>
							<span className={styles.integrateSuggestions__summaryDetail}>
								{t('Up to')} {totalEvaluators} {t('evaluators')}
							</span>
						</div>
						<div className={styles.integrateSuggestions__actions}>
							<button
								type="button"
								onClick={onClose}
								className={`${styles.integrateSuggestions__button} ${styles['integrateSuggestions__button--secondary']}`}
							>
								{t('Cancel')}
							</button>
							<button
								type="button"
								onClick={handleNext}
								disabled={selectedIds.length < 2}
								className={`${styles.integrateSuggestions__button} ${styles['integrateSuggestions__button--primary']}`}
							>
								{t('Continue')}
							</button>
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
};

export default IntegrateSuggestionsModal;

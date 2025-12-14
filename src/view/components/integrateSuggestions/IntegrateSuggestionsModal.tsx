import React, { FC, useState, useEffect, useCallback } from 'react';
import Modal from '@/view/components/modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { findSimilarForIntegration, executeIntegration } from '@/controllers/db/integration/integrationController';
import { logError } from '@/utils/errorHandling';
import type {
	IntegrateSuggestionsModalProps,
	IntegrationStep,
	StatementWithEvaluation,
} from '@/types/integration';
import SimilarGroupSelector from './SimilarGroupSelector';
import IntegrationPreview from './IntegrationPreview';
import styles from './IntegrateSuggestions.module.scss';

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
	const [suggestedTitle, setSuggestedTitle] = useState('');
	const [suggestedDescription, setSuggestedDescription] = useState('');

	// User selections
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [integratedTitle, setIntegratedTitle] = useState('');
	const [integratedDescription, setIntegratedDescription] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

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
					setSuggestedTitle(result.suggestedTitle);
					setIntegratedTitle(result.suggestedTitle);
				} else {
					setSuggestedTitle(result.sourceStatement.statement);
					setIntegratedTitle(result.sourceStatement.statement);
				}

				if (result.suggestedDescription) {
					setSuggestedDescription(result.suggestedDescription);
					setIntegratedDescription(result.suggestedDescription);
				} else {
					setSuggestedDescription(result.sourceStatement.description || '');
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
		const all = sourceStatement
			? [sourceStatement, ...similarStatements]
			: similarStatements;

		return all.filter(s => selectedIds.includes(s.statementId));
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

	// Calculate total evaluators
	const totalEvaluators = getSelectedStatements().reduce(
		(sum, s) => sum + s.numberOfEvaluators,
		0
	);

	return (
		<Modal closeModal={onClose} title={t('Integrate Similar Suggestions')}>
			<div className={styles.integrateSuggestions}>
				{/* Header */}
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

				{/* Content based on step */}
				<div className={styles.integrateSuggestions__content}>
					{step === 'loading' && (
						<div className={styles.integrateSuggestions__loading}>
							<div className={styles.spinner} />
							<p>{t('Finding similar suggestions...')}</p>
						</div>
					)}

					{step === 'error' && (
						<div className={styles.integrateSuggestions__error}>
							<p>{error}</p>
							<button
								type="button"
								onClick={onClose}
								className={styles.integrateSuggestions__button}
							>
								{t('Close')}
							</button>
						</div>
					)}

					{step === 'selection' && sourceStatement && (
						<SimilarGroupSelector
							sourceStatement={sourceStatement}
							similarStatements={similarStatements}
							selectedIds={selectedIds}
							onSelectionChange={handleSelectionChange}
						/>
					)}

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

					{step === 'success' && (
						<div className={styles.integrateSuggestions__success}>
							<div className={styles.integrateSuggestions__successIcon}>&#10003;</div>
							<p>{t('Integration successful')}</p>
							<p className={styles.integrateSuggestions__successDetails}>
								{t('Migrated evaluations from')} {selectedIds.length} {t('suggestions')}
							</p>
						</div>
					)}
				</div>

				{/* Error message */}
				{error && step !== 'error' && (
					<div className={styles.integrateSuggestions__errorMessage}>
						{error}
					</div>
				)}

				{/* Footer with actions */}
				{step === 'selection' && (
					<div className={styles.integrateSuggestions__footer}>
						<div className={styles.integrateSuggestions__summary}>
							<span>
								{selectedIds.length} {t('selected')} &bull; {totalEvaluators} {t('evaluators')}
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
								{t('Next')}
							</button>
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
};

export default IntegrateSuggestionsModal;

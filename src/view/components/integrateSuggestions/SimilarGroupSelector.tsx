import React, { FC, useCallback } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { SimilarGroupSelectorProps, StatementWithEvaluation } from '@/types/integration';
import styles from './IntegrateSuggestions.module.scss';

const SimilarGroupSelector: FC<SimilarGroupSelectorProps> = ({
	sourceStatement,
	similarStatements,
	selectedIds,
	onSelectionChange,
}) => {
	const { t } = useTranslation();

	// Check if a statement is selected
	const isSelected = useCallback(
		(statementId: string) => selectedIds.includes(statementId),
		[selectedIds]
	);

	// Toggle statement selection
	const toggleSelection = useCallback(
		(statementId: string, isSource: boolean) => {
			// Source statement cannot be deselected
			if (isSource) return;

			if (isSelected(statementId)) {
				onSelectionChange(selectedIds.filter(id => id !== statementId));
			} else {
				onSelectionChange([...selectedIds, statementId]);
			}
		},
		[selectedIds, onSelectionChange, isSelected]
	);

	// Select all similar statements
	const selectAll = useCallback(() => {
		const allIds = [sourceStatement.statementId, ...similarStatements.map(s => s.statementId)];
		onSelectionChange(allIds);
	}, [sourceStatement, similarStatements, onSelectionChange]);

	// Deselect all (except source)
	const deselectAll = useCallback(() => {
		onSelectionChange([sourceStatement.statementId]);
	}, [sourceStatement, onSelectionChange]);

	// Render a statement item
	const renderStatementItem = (statement: StatementWithEvaluation, isSource: boolean) => {
		const selected = isSelected(statement.statementId);

		return (
			<div
				key={statement.statementId}
				className={`${styles.selector__item} ${selected ? styles['selector__item--selected'] : ''} ${isSource ? styles['selector__item--source'] : ''}`}
				onClick={() => toggleSelection(statement.statementId, isSource)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						toggleSelection(statement.statementId, isSource);
					}
				}}
				role="checkbox"
				aria-checked={selected}
				tabIndex={0}
			>
				<div className={styles.selector__checkbox}>
					{selected && (
						<span className={styles.selector__checkmark}>&#10003;</span>
					)}
				</div>
				<div className={styles.selector__content}>
					<div className={styles.selector__title}>
						{statement.statement}
						{isSource && (
							<span className={styles.selector__badge}>{t('Source')}</span>
						)}
					</div>
					{statement.description && (
						<p className={styles.selector__description}>{statement.description}</p>
					)}
					<div className={styles.selector__meta}>
						<span className={styles.selector__evaluators}>
							{statement.numberOfEvaluators} {t('evaluators')}
						</span>
						<span className={styles.selector__consensus}>
							{t('Consensus')}: {(statement.consensus * 100).toFixed(0)}%
						</span>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className={styles.selector}>
			{/* Actions */}
			<div className={styles.selector__actions}>
				<button
					type="button"
					onClick={selectAll}
					className={styles.selector__actionButton}
				>
					{t('Select All')}
				</button>
				<button
					type="button"
					onClick={deselectAll}
					className={styles.selector__actionButton}
				>
					{t('Deselect All')}
				</button>
			</div>

			{/* Source statement (always first, cannot be deselected) */}
			<div className={styles.selector__section}>
				<h3 className={styles.selector__sectionTitle}>{t('Original Suggestion')}</h3>
				{renderStatementItem(sourceStatement, true)}
			</div>

			{/* Similar statements */}
			<div className={styles.selector__section}>
				<h3 className={styles.selector__sectionTitle}>
					{t('Similar Suggestions')} ({similarStatements.length})
				</h3>
				{similarStatements.length > 0 ? (
					<div className={styles.selector__list}>
						{similarStatements.map(statement => renderStatementItem(statement, false))}
					</div>
				) : (
					<p className={styles.selector__empty}>{t('No similar suggestions found')}</p>
				)}
			</div>
		</div>
	);
};

export default SimilarGroupSelector;

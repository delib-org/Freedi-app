import React, { FC, useCallback } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { SimilarGroupSelectorProps, StatementWithEvaluation } from '@/types/integration';
import styles from './IntegrateSuggestions.module.scss';

// Icon components for visual indicators
const UsersIcon: FC = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
		<path d="M16 3.13a4 4 0 0 1 0 7.75" />
	</svg>
);

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
		[selectedIds],
	);

	// Toggle statement selection
	const toggleSelection = useCallback(
		(statementId: string, isSource: boolean) => {
			// Source statement cannot be deselected
			if (isSource) return;

			if (isSelected(statementId)) {
				onSelectionChange(selectedIds.filter((id) => id !== statementId));
			} else {
				onSelectionChange([...selectedIds, statementId]);
			}
		},
		[selectedIds, onSelectionChange, isSelected],
	);

	// Select all similar statements
	const selectAll = useCallback(() => {
		const allIds = [sourceStatement.statementId, ...similarStatements.map((s) => s.statementId)];
		onSelectionChange(allIds);
	}, [sourceStatement, similarStatements, onSelectionChange]);

	// Deselect all (except source)
	const deselectAll = useCallback(() => {
		onSelectionChange([sourceStatement.statementId]);
	}, [sourceStatement, onSelectionChange]);

	// Format consensus percentage
	const formatConsensus = (consensus: number): string => {
		return `${(consensus * 100).toFixed(0)}%`;
	};

	// Render a statement item with improved layout
	const renderStatementItem = (statement: StatementWithEvaluation, isSource: boolean) => {
		const selected = isSelected(statement.statementId);
		const consensusPercent = Math.round(statement.consensus * 100);

		const itemClasses = [
			styles.selector__item,
			selected ? styles['selector__item--selected'] : '',
			isSource ? styles['selector__item--source'] : '',
		]
			.filter(Boolean)
			.join(' ');

		return (
			<div
				key={statement.statementId}
				className={itemClasses}
				onClick={() => toggleSelection(statement.statementId, isSource)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						toggleSelection(statement.statementId, isSource);
					}
				}}
				role="checkbox"
				aria-checked={selected}
				aria-label={`${statement.statement}${isSource ? ` (${t('Source')})` : ''}`}
				tabIndex={0}
			>
				<div className={styles.selector__checkbox}>
					{selected && <span className={styles.selector__checkmark}>&#10003;</span>}
				</div>
				<div className={styles.selector__content}>
					<div className={styles.selector__titleRow}>
						<span className={styles.selector__itemTitle}>{statement.statement}</span>
						{isSource && <span className={styles.selector__badge}>{t('Source')}</span>}
					</div>
					{statement.description && (
						<p className={styles.selector__description}>{statement.description}</p>
					)}
					<div className={styles.selector__meta}>
						<div className={styles.selector__metaItem}>
							<span className={styles.selector__metaIcon}>
								<UsersIcon />
							</span>
							<span className={styles.selector__metaValue}>{statement.numberOfEvaluators}</span>
							<span>{t('evaluators')}</span>
						</div>
						<div className={styles.selector__consensus}>
							<span>{t('Consensus')}:</span>
							<div className={styles.selector__consensusBar}>
								<div
									className={styles.selector__consensusFill}
									style={{ width: `${consensusPercent}%` }}
								/>
							</div>
							<span className={styles.selector__metaValue}>
								{formatConsensus(statement.consensus)}
							</span>
						</div>
					</div>
				</div>
			</div>
		);
	};

	// Count of selected similar statements (excluding source)
	const selectedSimilarCount = selectedIds.filter(
		(id) => id !== sourceStatement.statementId,
	).length;

	return (
		<div className={styles.selector}>
			{/* Header with quick actions */}
			<div className={styles.selector__header}>
				<h3 className={styles.selector__title}>{t('Choose suggestions to merge')}</h3>
				<div className={styles.selector__actions}>
					<button
						type="button"
						onClick={selectAll}
						className={styles.selector__actionButton}
						aria-label={t('Select All')}
					>
						{t('Select All')}
					</button>
					<button
						type="button"
						onClick={deselectAll}
						className={styles.selector__actionButton}
						aria-label={t('Deselect All')}
					>
						{t('Deselect All')}
					</button>
				</div>
			</div>

			{/* Source statement section */}
			<div className={styles.selector__section}>
				<div className={styles.selector__sectionHeader}>
					<h4 className={styles.selector__sectionTitle}>{t('Original Suggestion')}</h4>
				</div>
				{renderStatementItem(sourceStatement, true)}
			</div>

			{/* Similar statements section */}
			<div className={styles.selector__section}>
				<div className={styles.selector__sectionHeader}>
					<h4 className={styles.selector__sectionTitle}>{t('Similar Suggestions')}</h4>
					<span className={styles.selector__sectionCount}>
						{selectedSimilarCount}/{similarStatements.length}
					</span>
				</div>
				{similarStatements.length > 0 ? (
					<div className={styles.selector__list}>
						{similarStatements.map((statement) => renderStatementItem(statement, false))}
					</div>
				) : (
					<div className={styles.selector__empty}>
						<p>{t('No similar suggestions found')}</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default SimilarGroupSelector;

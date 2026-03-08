'use client';

import React, { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
	IncoherenceRecord,
	IncoherenceType,
	IncoherenceSeverity,
	ChangeDecision,
} from '@freedi/shared-types';
import { DiffView } from './DiffView';
import styles from './coherencePanel.module.scss';

interface IncoherenceCardProps {
	record: IncoherenceRecord;
	onReviewed: (recordId: string, decision: ChangeDecision) => void;
}

/**
 * IncoherenceCard - Displays a single incoherence issue with admin actions
 */
export function IncoherenceCard({ record, onReviewed }: IncoherenceCardProps) {
	const { t } = useTranslation();
	const [showReasoning, setShowReasoning] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isReviewed = record.adminDecision !== ChangeDecision.pending;

	const handleDecision = async (decision: ChangeDecision) => {
		try {
			setIsSubmitting(true);

			const response = await fetch(`/api/admin/coherence/${record.recordId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ adminDecision: decision }),
			});

			if (!response.ok) {
				throw new Error(`Failed to review: ${response.status}`);
			}

			onReviewed(record.recordId, decision);
		} catch (err) {
			console.error('[IncoherenceCard] Review error:', err);
		} finally {
			setIsSubmitting(false);
		}
	};

	const getTypeLabel = (): string => {
		const labels: Record<IncoherenceType, string> = {
			[IncoherenceType.contradiction]: t('contradiction'),
			[IncoherenceType.redundancy]: t('redundancy'),
			[IncoherenceType.gap]: t('gap'),
			[IncoherenceType.scopeDrift]: t('scopeDrift'),
		};

		return labels[record.type] || record.type;
	};

	const getSeverityLabel = (): string => {
		const labels: Record<IncoherenceSeverity, string> = {
			[IncoherenceSeverity.high]: t('severityHigh'),
			[IncoherenceSeverity.medium]: t('severityMedium'),
			[IncoherenceSeverity.low]: t('severityLow'),
		};

		return labels[record.severity] || record.severity;
	};

	const getDecisionLabel = (): string => {
		switch (record.adminDecision) {
			case ChangeDecision.approved: return t('acceptFix');
			case ChangeDecision.rejected: return t('rejectFix');
			case ChangeDecision.modified: return t('modifyFix');
			default: return '';
		}
	};

	return (
		<div
			className={`${styles.incoherenceCard} ${styles[`incoherenceCard--${record.severity}`]} ${isReviewed ? styles['incoherenceCard--reviewed'] : ''}`}
		>
			<div className={styles.incoherenceHeader}>
				<span className={`${styles.typeBadge} ${styles[`typeBadge--${record.type}`]}`}>
					{getTypeLabel()}
				</span>
				<span className={styles.severityBadge}>
					{getSeverityLabel()}
				</span>
			</div>

			<div className={styles.incoherenceBody}>
				<p className={styles.description}>{record.description}</p>

				{record.affectedParagraphIds.length > 0 && (
					<div className={styles.affectedParagraphs}>
						{record.affectedParagraphIds.map((id) => (
							<span key={id} className={styles.paragraphSnippet}>
								{id.substring(0, 20)}...
							</span>
						))}
					</div>
				)}

				{record.suggestedFix && (
					<div className={styles.fixSection}>
						<div className={styles.fixLabel}>{t('suggestedFix')}</div>
						<DiffView
							currentText=""
							proposedText={record.suggestedFix}
							mode="compact"
							maxLines={3}
						/>
					</div>
				)}

				{record.aiReasoning && (
					<>
						<button
							className={styles.reasoningToggle}
							onClick={() => setShowReasoning(!showReasoning)}
						>
							{showReasoning ? '- ' : '+ '}
							{t('AI Reasoning')}
						</button>
						{showReasoning && (
							<div className={styles.reasoning}>
								{record.aiReasoning}
							</div>
						)}
					</>
				)}

				{isReviewed ? (
					<span
						className={`${styles.decisionBadge} ${styles[`decisionBadge--${record.adminDecision}`]}`}
					>
						{getDecisionLabel()}
					</span>
				) : (
					<div className={styles.actions}>
						<button
							className={`${styles.actionButton} ${styles['actionButton--accept']}`}
							onClick={() => handleDecision(ChangeDecision.approved)}
							disabled={isSubmitting}
						>
							{t('acceptFix')}
						</button>
						<button
							className={`${styles.actionButton} ${styles['actionButton--reject']}`}
							onClick={() => handleDecision(ChangeDecision.rejected)}
							disabled={isSubmitting}
						>
							{t('rejectFix')}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

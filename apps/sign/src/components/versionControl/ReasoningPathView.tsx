'use client';

import React, { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { ParagraphReasoningPath, ParagraphAction } from '@freedi/shared-types';
import styles from './coherencePanel.module.scss';

interface ReasoningPathViewProps {
	reasoningPaths: ParagraphReasoningPath[];
}

/**
 * ReasoningPathView - Shows reasoning trail for each paragraph
 * Collapsible advanced view showing what happened to each paragraph and why
 */
export function ReasoningPathView({ reasoningPaths }: ReasoningPathViewProps) {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	// Only show paragraphs that had changes
	const changedPaths = reasoningPaths.filter(
		(path) => path.action !== ParagraphAction.kept
	);

	if (changedPaths.length === 0) return null;

	return (
		<div className={styles.reasoningPathView}>
			<button
				className={styles.reasoningPathHeader}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
			>
				<h4 className={styles.reasoningPathTitle}>
					{t('reasoningPath')} ({changedPaths.length})
				</h4>
				<svg
					className={`${styles.chevron} ${isOpen ? styles['chevron--open'] : ''}`}
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{isOpen && (
				<div className={styles.reasoningPathBody}>
					{changedPaths.map((path) => (
						<div
							key={path.paragraphId}
							className={`${styles.pathItem} ${styles[`pathItem--${path.action}`]}`}
						>
							<div className={styles.pathParagraphId}>
								{path.paragraphId.substring(0, 24)}...
							</div>
							<div className={styles.pathAction}>
								{path.action}
							</div>
							<div className={styles.pathSummary}>
								{path.aiDecisionSummary}
							</div>
							{path.feedbackAddressed.length > 0 && (
								<div className={styles.pathFeedback}>
									{path.feedbackAddressed.length} {t('feedback items addressed')}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

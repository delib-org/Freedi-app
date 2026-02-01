'use client';

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Paragraph, ParagraphType } from '@freedi/shared-types';
import styles from './documentContextPanel.module.scss';

interface DocumentContextPanelProps {
	currentParagraph?: Paragraph;
	prevParagraph?: Paragraph;
	nextParagraph?: Paragraph;
	proposedText: string;
	paragraphNumber: number;
	onNavigate?: (paragraphId: string) => void;
}

/**
 * Document Context Panel - Shows paragraph location within document
 *
 * Design goals:
 * 1. Show surrounding paragraphs for context
 * 2. Highlight the current paragraph being changed
 * 3. Preview how the change will look in context
 * 4. Allow navigation to full document view
 */
export function DocumentContextPanel({
	currentParagraph,
	prevParagraph,
	nextParagraph,
	proposedText,
	paragraphNumber,
	onNavigate,
}: DocumentContextPanelProps) {
	const { t, tWithParams } = useTranslation();

	// Strip HTML for display
	const stripHtml = (html: string): string => {
		if (typeof window !== 'undefined') {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			return doc.body.textContent || '';
		}
		return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
	};

	// Get paragraph type label
	const getParagraphTypeLabel = (type: ParagraphType): string => {
		const labels: Record<ParagraphType, string> = {
			[ParagraphType.h1]: t('Heading 1'),
			[ParagraphType.h2]: t('Heading 2'),
			[ParagraphType.h3]: t('Heading 3'),
			[ParagraphType.h4]: t('Heading 4'),
			[ParagraphType.h5]: t('Heading 5'),
			[ParagraphType.h6]: t('Heading 6'),
			[ParagraphType.paragraph]: t('Paragraph'),
			[ParagraphType.li]: t('List Item'),
			[ParagraphType.table]: t('Table'),
			[ParagraphType.image]: t('Image'),
		};
		return labels[type] || t('Paragraph');
	};

	// Render paragraph preview
	const renderParagraphPreview = (
		paragraph: Paragraph | undefined,
		label: string,
		isHighlighted?: boolean,
		customContent?: string
	) => {
		if (!paragraph && !customContent) {
			return (
				<div className={styles.context__emptyParagraph}>
					<span className={styles.context__emptyLabel}>{label}</span>
					<span className={styles.context__emptyText}>
						{t('No paragraph')}
					</span>
				</div>
			);
		}

		const content = customContent || (paragraph ? stripHtml(paragraph.content) : '');
		const type = paragraph?.type || ParagraphType.paragraph;

		return (
			<div
				className={`${styles.context__paragraph} ${isHighlighted ? styles['context__paragraph--highlighted'] : ''}`}
			>
				<div className={styles.context__paragraphHeader}>
					<span className={styles.context__paragraphLabel}>{label}</span>
					<span className={styles.context__paragraphType}>
						{getParagraphTypeLabel(type)}
					</span>
				</div>
				<div
					className={`${styles.context__paragraphContent} ${styles[`context__paragraphContent--${type}`]}`}
				>
					{content}
				</div>
			</div>
		);
	};

	return (
		<div className={styles.context}>
			{/* Header */}
			<div className={styles.context__header}>
				<h4 className={styles.context__title}>
					{t('Document Context')}
				</h4>
				<span className={styles.context__position}>
					{tWithParams('Paragraph {{number}}', { number: paragraphNumber })}
				</span>
			</div>

			{/* Explanation */}
			<p className={styles.context__explanation}>
				{t('This shows how the paragraph fits within the document. The highlighted section shows the proposed change.')}
			</p>

			{/* Context Preview */}
			<div className={styles.context__preview}>
				{/* Previous Paragraph */}
				{renderParagraphPreview(
					prevParagraph,
					t('Previous Paragraph')
				)}

				{/* Current Paragraph - Before/After Toggle */}
				<div className={styles.context__currentSection}>
					<div className={styles.context__currentHeader}>
						<span className={styles.context__currentLabel}>
							{t('Current Paragraph')} (#{paragraphNumber})
						</span>
						{onNavigate && currentParagraph && (
							<button
								type="button"
								onClick={() => onNavigate(currentParagraph.paragraphId)}
								className={styles.context__viewButton}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									<polyline points="15,3 21,3 21,9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
								{t('View in Document')}
							</button>
						)}
					</div>

					{/* Before/After Comparison */}
					<div className={styles.context__comparison}>
						<div className={styles.context__comparisonColumn}>
							<span className={styles.context__comparisonLabel}>
								{t('Current')}
							</span>
							{renderParagraphPreview(
								currentParagraph,
								'',
								false,
								currentParagraph ? undefined : t('Empty paragraph')
							)}
						</div>

						<div className={styles.context__arrow}>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<line x1="5" y1="12" x2="19" y2="12" />
								<polyline points="12,5 19,12 12,19" />
							</svg>
						</div>

						<div className={styles.context__comparisonColumn}>
							<span className={`${styles.context__comparisonLabel} ${styles['context__comparisonLabel--proposed']}`}>
								{t('Proposed')}
							</span>
							{renderParagraphPreview(
								currentParagraph,
								'',
								true,
								proposedText
							)}
						</div>
					</div>
				</div>

				{/* Next Paragraph */}
				{renderParagraphPreview(
					nextParagraph,
					t('Next Paragraph')
				)}
			</div>

			{/* Visual indicator of document flow */}
			<div className={styles.context__flowIndicator}>
				<div className={styles.context__flowLine} />
				<div className={styles.context__flowDots}>
					<span className={styles.context__flowDot} />
					<span className={`${styles.context__flowDot} ${styles['context__flowDot--active']}`} />
					<span className={styles.context__flowDot} />
				</div>
				<div className={styles.context__flowLine} />
			</div>
		</div>
	);
}

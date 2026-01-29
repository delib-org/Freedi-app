'use client';

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { PendingReplacement } from '@freedi/shared-types';
import { DiffView } from './DiffView';
import styles from './reviewQueueCard.module.scss';

// Type for translation functions
type TFunction = (key: string) => string;
type TWithParamsFunction = (key: string, params: Record<string, string | number>) => string;

interface ReviewQueueCardProps {
	item: PendingReplacement;
	paragraphNumber?: number;
	sectionTitle?: string;
	onReview: (item: PendingReplacement) => void;
	onQuickApprove?: (item: PendingReplacement) => void;
	onViewInContext?: (item: PendingReplacement) => void;
}

/**
 * Review Queue Card - Enhanced card for displaying pending suggestions
 *
 * Design improvements:
 * 1. Clear visual hierarchy with consensus as primary metric
 * 2. Document location context (paragraph number, section)
 * 3. Inline diff preview showing actual changes
 * 4. Quick actions for efficient workflow
 * 5. Staleness warnings with clear visual indicators
 */
export function ReviewQueueCard({
	item,
	paragraphNumber,
	sectionTitle,
	onReview,
	onQuickApprove,
	onViewInContext,
}: ReviewQueueCardProps) {
	const { t, tWithParams } = useTranslation();

	// Calculate staleness (consensus drop)
	const consensusDrop = item.consensusAtCreation - item.consensus;
	const isStale = consensusDrop > 0.1;
	const isHighConsensus = item.consensus >= 0.8;

	// Calculate time since creation
	const timeAgo = getTimeAgo(item.createdAt, t, tWithParams);

	// Determine consensus indicator color
	const getConsensusClass = () => {
		if (item.consensus >= 0.8) return styles['card__consensus--high'];
		if (item.consensus >= 0.6) return styles['card__consensus--medium'];
		return styles['card__consensus--low'];
	};

	return (
		<article
			className={`${styles.card} ${isStale ? styles['card--stale'] : ''}`}
			role="article"
			aria-label={tWithParams('Pending suggestion for paragraph {{number}}', { number: paragraphNumber || '?' })}
		>
			{/* Header: Location + Status */}
			<header className={styles.card__header}>
				<div className={styles.card__location}>
					{paragraphNumber && (
						<span className={styles.card__paragraphNumber}>
							{t('Paragraph')} #{paragraphNumber}
						</span>
					)}
					{sectionTitle && (
						<span className={styles.card__section}>
							{sectionTitle}
						</span>
					)}
				</div>

				<div className={styles.card__badges}>
					{isHighConsensus && (
						<span className={`${styles.card__badge} ${styles['card__badge--success']}`}>
							{t('High Agreement')}
						</span>
					)}
					{isStale && (
						<span className={`${styles.card__badge} ${styles['card__badge--warning']}`}>
							{t('Consensus Dropped')}
						</span>
					)}
				</div>
			</header>

			{/* Consensus Indicator */}
			<div className={styles.card__consensusSection}>
				<div className={`${styles.card__consensus} ${getConsensusClass()}`}>
					<span className={styles.card__consensusValue}>
						{Math.round(item.consensus * 100)}%
					</span>
					<span className={styles.card__consensusLabel}>
						{t('consensus')}
					</span>
				</div>

				{/* Consensus change indicator */}
				{consensusDrop !== 0 && (
					<div className={styles.card__consensusChange}>
						{consensusDrop > 0 ? (
							<span className={styles['card__consensusChange--down']}>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
									<path d="M7 14l5 5 5-5H7z" />
								</svg>
								{Math.round(consensusDrop * 100)}%
							</span>
						) : (
							<span className={styles['card__consensusChange--up']}>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
									<path d="M7 10l5-5 5 5H7z" />
								</svg>
								{Math.round(Math.abs(consensusDrop) * 100)}%
							</span>
						)}
						<span className={styles.card__consensusChangeLabel}>
							{t('since submitted')}
						</span>
					</div>
				)}
			</div>

			{/* Change Preview - Inline Diff */}
			<div className={styles.card__preview}>
				<h4 className={styles.card__previewTitle}>
					{t('Proposed Change')}
				</h4>
				<DiffView
					currentText={item.currentText}
					proposedText={item.proposedText}
					mode="compact"
					maxLines={3}
				/>
			</div>

			{/* Metadata Row */}
			<div className={styles.card__meta}>
				<div className={styles.card__metaItem}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					<span>{item.evaluationCount} {t('votes')}</span>
				</div>

				<div className={styles.card__metaItem}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12,6 12,12 16,14" />
					</svg>
					<span>{timeAgo}</span>
				</div>

				<div className={styles.card__metaItem}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
					<span>{item.creatorDisplayName || t('Anonymous')}</span>
				</div>
			</div>

			{/* Actions */}
			<footer className={styles.card__actions}>
				{onViewInContext && (
					<button
						type="button"
						onClick={() => onViewInContext(item)}
						className={styles.card__actionSecondary}
						aria-label={t('View in document context')}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						{t('View in Context')}
					</button>
				)}

				{onQuickApprove && isHighConsensus && (
					<button
						type="button"
						onClick={() => onQuickApprove(item)}
						className={styles.card__actionQuickApprove}
						aria-label={t('Quick approve this suggestion')}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<polyline points="20,6 9,17 4,12" />
						</svg>
						{t('Quick Approve')}
					</button>
				)}

				<button
					type="button"
					onClick={() => onReview(item)}
					className={styles.card__actionPrimary}
					aria-label={t('Open detailed review for this suggestion')}
				>
					{t('Review Details')}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<polyline points="9,18 15,12 9,6" />
					</svg>
				</button>
			</footer>
		</article>
	);
}

/**
 * Helper function to format time ago
 */
function getTimeAgo(
	timestamp: number,
	t: TFunction,
	tWithParams: TWithParamsFunction
): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return t('Just now');
	if (minutes < 60) return tWithParams('{{count}} min ago', { count: minutes });
	if (hours < 24) return tWithParams('{{count}} hours ago', { count: hours });
	if (days < 7) return tWithParams('{{count}} days ago', { count: days });

	return new Date(timestamp).toLocaleDateString();
}

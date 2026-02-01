'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useReplacementQueueStore } from '@/store/replacementQueueStore';
import { PendingReplacement, Paragraph } from '@freedi/shared-types';
import { ReviewQueueCard } from './ReviewQueueCard';
import { EnhancedReviewModal } from './EnhancedReviewModal';
import styles from './reviewQueueListEnhanced.module.scss';

interface ReviewQueueListEnhancedProps {
	documentId: string;
	documentTitle?: string;
	paragraphs?: Paragraph[];
	onNavigateToDocument?: (paragraphId: string) => void;
}

type SortOption = 'consensus' | 'createdAt' | 'evaluationCount' | 'staleness';
type FilterOption = 'all' | 'highConsensus' | 'stale' | 'recent';

/**
 * Enhanced Review Queue List
 *
 * Design improvements:
 * 1. Better filtering and sorting options
 * 2. Summary statistics at the top
 * 3. Batch action support
 * 4. Empty state with helpful guidance
 * 5. Keyboard navigation support
 */
export function ReviewQueueListEnhanced({
	documentId,
	documentTitle,
	paragraphs,
	onNavigateToDocument,
}: ReviewQueueListEnhancedProps) {
	const { t, tWithParams } = useTranslation();
	const {
		pendingReplacements,
		isLoading,
		error,
		subscribeToPendingReplacements,
	} = useReplacementQueueStore();

	const queue = useMemo(() => pendingReplacements[documentId] || [], [pendingReplacements, documentId]);
	const loading = isLoading[documentId];
	const loadError = error[documentId];

	const [selectedItem, setSelectedItem] = useState<PendingReplacement | null>(null);
	const [sortBy, setSortBy] = useState<SortOption>('consensus');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [filterBy, setFilterBy] = useState<FilterOption>('all');
	const [searchQuery, setSearchQuery] = useState('');

	// Subscribe to queue on mount
	useEffect(() => {
		const unsubscribe = subscribeToPendingReplacements(documentId, sortBy, sortDirection);
		return () => unsubscribe();
	}, [documentId, sortBy, sortDirection, subscribeToPendingReplacements]);

	// Calculate statistics
	const stats = useMemo(() => {
		const total = queue.length;
		const highConsensus = queue.filter(item => item.consensus >= 0.8).length;
		const stale = queue.filter(item => (item.consensusAtCreation - item.consensus) > 0.1).length;
		const avgConsensus = total > 0
			? queue.reduce((sum, item) => sum + item.consensus, 0) / total
			: 0;

		return { total, highConsensus, stale, avgConsensus };
	}, [queue]);

	// Filter and sort queue
	const filteredQueue = useMemo(() => {
		let result = [...queue];

		// Apply filter
		switch (filterBy) {
			case 'highConsensus':
				result = result.filter(item => item.consensus >= 0.8);
				break;
			case 'stale':
				result = result.filter(item => (item.consensusAtCreation - item.consensus) > 0.1);
				break;
			case 'recent':
				const oneDayAgo = Date.now() - 86400000;
				result = result.filter(item => item.createdAt > oneDayAgo);
				break;
		}

		// Apply search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(item =>
				item.currentText.toLowerCase().includes(query) ||
				item.proposedText.toLowerCase().includes(query) ||
				item.creatorDisplayName?.toLowerCase().includes(query)
			);
		}

		// Apply sort
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortBy) {
				case 'consensus':
					comparison = a.consensus - b.consensus;
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'evaluationCount':
					comparison = a.evaluationCount - b.evaluationCount;
					break;
				case 'staleness':
					const staleA = a.consensusAtCreation - a.consensus;
					const staleB = b.consensusAtCreation - b.consensus;
					comparison = staleA - staleB;
					break;
			}
			return sortDirection === 'desc' ? -comparison : comparison;
		});

		return result;
	}, [queue, filterBy, searchQuery, sortBy, sortDirection]);

	// Get paragraph number for an item
	const getParagraphNumber = useCallback((item: PendingReplacement): number | undefined => {
		if (!paragraphs) return undefined;
		const index = paragraphs.findIndex(p => p.paragraphId === item.paragraphId);
		return index >= 0 ? index + 1 : undefined;
	}, [paragraphs]);

	// Handle quick approve
	const handleQuickApprove = useCallback((item: PendingReplacement) => {
		// Open modal for confirmation even on quick approve
		setSelectedItem(item);
	}, []);

	// Handle view in context
	const handleViewInContext = useCallback((item: PendingReplacement) => {
		if (onNavigateToDocument) {
			onNavigateToDocument(item.paragraphId);
		}
	}, [onNavigateToDocument]);

	if (loading) {
		return (
			<div className={styles.queueList}>
				<div className={styles.queueList__loading}>
					<div className={styles.queueList__spinner} />
					<span>{t('Loading review queue...')}</span>
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles.queueList}>
				<div className={styles.queueList__error}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
					<span>{t('Error loading queue:')} {loadError.message}</span>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.queueList}>
			{/* Header with Statistics */}
			<header className={styles.queueList__header}>
				<div className={styles.queueList__titleSection}>
					<h2 className={styles.queueList__title}>
						{t('Pending Reviews')}
					</h2>
					<span className={styles.queueList__count}>
						{stats.total} {t('items')}
					</span>
				</div>

				{/* Quick Stats */}
				{stats.total > 0 && (
					<div className={styles.queueList__stats}>
						<div className={`${styles.queueList__stat} ${styles['queueList__stat--success']}`}>
							<span className={styles.queueList__statValue}>{stats.highConsensus}</span>
							<span className={styles.queueList__statLabel}>{t('Ready to Approve')}</span>
						</div>
						{stats.stale > 0 && (
							<div className={`${styles.queueList__stat} ${styles['queueList__stat--warning']}`}>
								<span className={styles.queueList__statValue}>{stats.stale}</span>
								<span className={styles.queueList__statLabel}>{t('Consensus Dropped')}</span>
							</div>
						)}
						<div className={styles.queueList__stat}>
							<span className={styles.queueList__statValue}>
								{Math.round(stats.avgConsensus * 100)}%
							</span>
							<span className={styles.queueList__statLabel}>{t('Avg Consensus')}</span>
						</div>
					</div>
				)}
			</header>

			{/* Controls */}
			<div className={styles.queueList__controls}>
				{/* Search */}
				<div className={styles.queueList__search}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={t('Search suggestions...')}
						className={styles.queueList__searchInput}
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery('')}
							className={styles.queueList__searchClear}
							aria-label={t('Clear search')}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					)}
				</div>

				{/* Filter */}
				<div className={styles.queueList__filter}>
					<label htmlFor="filter-select" className={styles.queueList__filterLabel}>
						{t('Filter:')}
					</label>
					<select
						id="filter-select"
						value={filterBy}
						onChange={(e) => setFilterBy(e.target.value as FilterOption)}
						className={styles.queueList__select}
					>
						<option value="all">{t('All Items')}</option>
						<option value="highConsensus">{t('High Consensus (80%+)')}</option>
						<option value="stale">{t('Consensus Dropped')}</option>
						<option value="recent">{t('Recent (24h)')}</option>
					</select>
				</div>

				{/* Sort */}
				<div className={styles.queueList__sort}>
					<label htmlFor="sort-select" className={styles.queueList__sortLabel}>
						{t('Sort:')}
					</label>
					<select
						id="sort-select"
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as SortOption)}
						className={styles.queueList__select}
					>
						<option value="consensus">{t('Consensus')}</option>
						<option value="createdAt">{t('Date Added')}</option>
						<option value="evaluationCount">{t('Vote Count')}</option>
						<option value="staleness">{t('Staleness')}</option>
					</select>
					<button
						type="button"
						onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
						className={styles.queueList__sortDirection}
						aria-label={sortDirection === 'desc' ? t('Sort ascending') : t('Sort descending')}
					>
						{sortDirection === 'desc' ? (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 5v14M5 12l7 7 7-7" />
							</svg>
						) : (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 19V5M5 12l7-7 7 7" />
							</svg>
						)}
					</button>
				</div>
			</div>

			{/* Queue Items */}
			{filteredQueue.length === 0 ? (
				<div className={styles.queueList__empty}>
					<div className={styles.queueList__emptyIcon}>
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M9 11l3 3L22 4" />
							<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
						</svg>
					</div>
					<h3 className={styles.queueList__emptyTitle}>
						{searchQuery || filterBy !== 'all'
							? t('No matching items')
							: t('No pending reviews')
						}
					</h3>
					<p className={styles.queueList__emptyText}>
						{searchQuery || filterBy !== 'all'
							? t('Try adjusting your search or filter criteria')
							: t('Suggestions will appear here when they reach the review threshold')
						}
					</p>
					{(searchQuery || filterBy !== 'all') && (
						<button
							type="button"
							onClick={() => {
								setSearchQuery('');
								setFilterBy('all');
							}}
							className={styles.queueList__emptyClear}
						>
							{t('Clear filters')}
						</button>
					)}
				</div>
			) : (
				<div className={styles.queueList__items}>
					{filteredQueue.map((item) => (
						<ReviewQueueCard
							key={item.queueId}
							item={item}
							paragraphNumber={getParagraphNumber(item)}
							onReview={setSelectedItem}
							onQuickApprove={item.consensus >= 0.8 ? handleQuickApprove : undefined}
							onViewInContext={onNavigateToDocument ? handleViewInContext : undefined}
						/>
					))}
				</div>
			)}

			{/* Results Summary */}
			{filteredQueue.length > 0 && filteredQueue.length !== stats.total && (
				<div className={styles.queueList__resultsSummary}>
					{tWithParams('Showing {{shown}} of {{total}} items', {
						shown: filteredQueue.length,
						total: stats.total,
					})}
				</div>
			)}

			{/* Review Modal */}
			{selectedItem && (
				<EnhancedReviewModal
					queueItem={selectedItem}
					onClose={() => setSelectedItem(null)}
					documentTitle={documentTitle}
					paragraphs={paragraphs}
					onNavigateToContext={onNavigateToDocument}
				/>
			)}
		</div>
	);
}

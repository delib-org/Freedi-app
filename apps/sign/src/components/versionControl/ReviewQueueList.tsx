'use client';

import React, { useEffect, useState } from 'react';
import { useReplacementQueueStore } from '@/store/replacementQueueStore';
import { PendingReplacement } from '@freedi/shared-types';
import { ReviewModal } from './ReviewModal';
import styles from './versionControl.module.scss';

interface ReviewQueueListProps {
	documentId: string;
}

/**
 * Review Queue List Component
 * Displays pending replacement queue items with real-time updates
 */
export function ReviewQueueList({ documentId }: ReviewQueueListProps) {
	const { pendingReplacements, isLoading, error, subscribeToPendingReplacements, getPendingCount } =
		useReplacementQueueStore();

	const queue = pendingReplacements[documentId] || [];
	const loading = isLoading[documentId];
	const loadError = error[documentId];

	const [selectedItem, setSelectedItem] = useState<PendingReplacement | null>(null);
	const [sortBy, setSortBy] = useState('consensus');

	// Subscribe to queue on mount
	useEffect(() => {
		const unsubscribe = subscribeToPendingReplacements(documentId, sortBy, 'desc');
		return () => unsubscribe();
	}, [documentId, sortBy, subscribeToPendingReplacements]);

	const pendingCount = getPendingCount(documentId);

	// Calculate staleness (consensus drop detection)
	const calculateStaleness = (item: PendingReplacement) => {
		const drop = item.consensusAtCreation - item.consensus;
		return drop > 0.1 ? drop : 0; // Show if dropped > 10%
	};

	if (loading) {
		return (
			<div className={styles['queue-list']}>
				<div className={styles['queue-list__loading']}>Loading queue...</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles['queue-list']}>
				<div className={styles['queue-list__error']}>
					Error loading queue: {loadError.message}
				</div>
			</div>
		);
	}

	return (
		<div className={styles['queue-list']}>
			<div className={styles['queue-list__header']}>
				<h2 className={styles['queue-list__title']}>
					Pending Reviews ({pendingCount})
				</h2>

				{/* Sort Controls */}
				<div className={styles['queue-list__sort']}>
					<label className={styles['queue-list__sort-label']}>Sort by:</label>
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value)}
						className={styles['queue-list__sort-select']}
					>
						<option value="consensus">Consensus (High to Low)</option>
						<option value="createdAt">Date Added</option>
						<option value="evaluationCount">Vote Count</option>
					</select>
				</div>
			</div>

			{/* Queue Items */}
			{queue.length === 0 ? (
				<div className={styles['queue-list__empty']}>
					<p>No pending reviews</p>
					<p className={styles['queue-list__empty-help']}>
						Suggestions will appear here when they reach the review threshold
					</p>
				</div>
			) : (
				<div className={styles['queue-list__items']}>
					{queue.map((item) => {
						const staleness = calculateStaleness(item);
						const isStale = staleness > 0;

						return (
							<div
								key={item.queueId}
								className={`${styles['queue-item']} ${isStale ? styles['queue-item--stale'] : ''}`}
							>
								{/* Consensus Badge */}
								<div className={styles['queue-item__consensus']}>
									<div className={styles['queue-item__consensus-value']}>
										{Math.round(item.consensus * 100)}%
									</div>
									<div className={styles['queue-item__consensus-label']}>consensus</div>
								</div>

								{/* Content Preview */}
								<div className={styles['queue-item__content']}>
									<div className={styles['queue-item__current']}>
										<strong>Current:</strong>
										<p className={styles['queue-item__text']}>
											{item.currentText.substring(0, 100)}
											{item.currentText.length > 100 ? '...' : ''}
										</p>
									</div>
									<div className={styles['queue-item__arrow']}>→</div>
									<div className={styles['queue-item__proposed']}>
										<strong>Proposed:</strong>
										<p className={styles['queue-item__text']}>
											{item.proposedText.substring(0, 100)}
											{item.proposedText.length > 100 ? '...' : ''}
										</p>
									</div>
								</div>

								{/* Metadata */}
								<div className={styles['queue-item__meta']}>
									<span className={styles['queue-item__meta-item']}>
										{item.evaluationCount} votes
									</span>
									<span className={styles['queue-item__meta-item']}>
										by {item.creatorDisplayName || 'Anonymous'}
									</span>
									{isStale && (
										<span className={styles['queue-item__meta-item--warning']}>
											Consensus dropped {Math.round(staleness * 100)}%
										</span>
									)}
								</div>

								{/* Actions */}
								<div className={styles['queue-item__actions']}>
									<button
										onClick={() => setSelectedItem(item)}
										className={styles['queue-item__button']}
									>
										Review
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Review Modal */}
			{selectedItem && (
				<ReviewModal
					queueItem={selectedItem}
					onClose={() => setSelectedItem(null)}
				/>
			)}
		</div>
	);
}

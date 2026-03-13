'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { DocumentActionType } from '@freedi/shared-types';
import { useActionHistoryStore, ActionHistoryEntry } from '@/store/actionHistoryStore';
import { logError } from '@/lib/utils/errorHandling';
import styles from './actionHistoryPanel.module.scss';

type FilterOption = 'all' | 'removals' | 'additions' | 'active';

interface ActionHistoryPanelProps {
	documentId: string;
}

const BADGE_LABELS: Record<DocumentActionType, string> = {
	[DocumentActionType.remove]: 'Remove',
	[DocumentActionType.add]: 'Add',
	[DocumentActionType.replace]: 'Replace',
};

function formatTimestamp(ms: number): string {
	return new Date(ms).toLocaleString();
}

function getContentPreview(entry: ActionHistoryEntry): string {
	if (entry.actionType === DocumentActionType.add) {
		return entry.newContent || '';
	}

	return entry.previousContent || entry.newContent || '';
}

export function ActionHistoryPanel({ documentId }: ActionHistoryPanelProps) {
	const { t } = useTranslation();
	const { subscribeToHistory, cleanup, undoAction, isLoading, error, entries } =
		useActionHistoryStore();

	const [filter, setFilter] = useState<FilterOption>('all');
	const [undoingId, setUndoingId] = useState<string | null>(null);

	useEffect(() => {
		const unsubscribe = subscribeToHistory(documentId);

		return () => {
			unsubscribe();
			cleanup(documentId);
		};
	}, [documentId, subscribeToHistory, cleanup]);

	const loading = isLoading[documentId];
	const loadError = error[documentId];

	const filteredEntries = useMemo(() => {
		const allEntries = entries[documentId] || [];

		switch (filter) {
			case 'removals':
				return allEntries.filter((e) => e.actionType === DocumentActionType.remove);
			case 'additions':
				return allEntries.filter((e) => e.actionType === DocumentActionType.add);
			case 'active':
				return allEntries.filter((e) => !e.undoneAt);
			default:
				return allEntries;
		}
	}, [entries, documentId, filter]);

	const handleUndo = async (entry: ActionHistoryEntry) => {
		setUndoingId(entry.actionId);
		try {
			await undoAction(entry.actionId, documentId);
		} catch (err) {
			logError(err, {
				operation: 'ActionHistoryPanel.handleUndo',
				documentId,
				metadata: { actionId: entry.actionId },
			});
		} finally {
			setUndoingId(null);
		}
	};

	if (loading) {
		return (
			<div className={styles['history-panel']}>
				<div className={styles['history-panel__loading']}>
					{t('loadingHistory') || 'Loading action history...'}
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className={styles['history-panel']}>
				<div className={styles['history-panel__error']}>
					{t('errorLoadingHistory') || 'Error loading history:'} {loadError.message}
				</div>
			</div>
		);
	}

	return (
		<div className={styles['history-panel']}>
			<div className={styles['history-panel__header']}>
				<h2 className={styles['history-panel__title']}>
					{t('actionHistory') || 'Action History'}
				</h2>
				<div className={styles['history-panel__filter']}>
					<label
						htmlFor="history-filter"
						className={styles['history-panel__filter-label']}
					>
						{t('filter') || 'Filter'}:
					</label>
					<select
						id="history-filter"
						className={styles['history-panel__filter-select']}
						value={filter}
						onChange={(e) => setFilter(e.target.value as FilterOption)}
					>
						<option value="all">{t('filterAll') || 'All'}</option>
						<option value="removals">{t('filterRemovals') || 'Removals only'}</option>
						<option value="additions">{t('filterAdditions') || 'Additions only'}</option>
						<option value="active">{t('filterActive') || 'Active only'}</option>
					</select>
				</div>
			</div>

			{filteredEntries.length === 0 ? (
				<div className={styles['history-panel__empty']}>
					{t('noActionsYet') || 'No actions recorded yet.'}
				</div>
			) : (
				<div className={styles['history-panel__list']}>
					{filteredEntries.map((entry) => {
						const isUndone = Boolean(entry.undoneAt);
						const isUndoing = undoingId === entry.actionId;
						const preview = getContentPreview(entry);
						const badgeModifier = styles[`entry__badge--${entry.actionType}`];

						return (
							<article
								key={entry.actionId}
								className={`${styles.entry} ${isUndone ? styles['entry--undone'] : ''}`}
							>
								<div className={styles['entry__top-row']}>
									<span className={`${styles['entry__badge']} ${badgeModifier}`}>
										{t(`actionType_${entry.actionType}`) || BADGE_LABELS[entry.actionType]}
									</span>
									<span className={styles['entry__timestamp']}>
										{formatTimestamp(entry.executedAt)}
									</span>
								</div>

								{preview && (
									<p className={`${styles['entry__content']} ${isUndone ? styles['entry__content--struck'] : ''}`}>
										{preview}
									</p>
								)}

								<div className={styles['entry__meta']}>
									<span className={styles['entry__meta-item']}>
										{t('consensus') || 'Consensus'}: {Math.round(entry.consensus * 100)}%
									</span>
									<span className={styles['entry__meta-item']}>
										{t('evaluators') || 'Evaluators'}: {entry.evaluatorCount}
									</span>
								</div>

								{isUndone && entry.undoneAt && (
									<div className={styles['entry__undone-info']}>
										{t('undoneBy') || 'Undone by'} {entry.undoneBy || t('admin') || 'admin'}{' '}
										{t('at') || 'at'} {formatTimestamp(entry.undoneAt)}
									</div>
								)}

								{!isUndone && (
									<div className={styles['entry__actions']}>
										<button
											type="button"
											className={styles['entry__undo-button']}
											disabled={isUndoing}
											onClick={() => handleUndo(entry)}
											aria-label={t('undoAction') || 'Undo this action'}
										>
											{isUndoing
												? (t('undoing') || 'Undoing...')
												: (t('undo') || 'Undo')}
										</button>
									</div>
								)}
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}

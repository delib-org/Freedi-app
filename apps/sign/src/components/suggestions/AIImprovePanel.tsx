'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { API_ROUTES, SUGGESTIONS } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';
import styles from './AIImprovePanel.module.scss';

interface AIImprovePanelProps {
	improveResult: {
		improvedText: string;
		changes: Array<{ description: string; fromComment?: string }>;
	};
	suggestionId: string;
	paragraphId: string;
	onSaved: () => void;
	onDismiss: () => void;
}

export default function AIImprovePanel({
	improveResult,
	suggestionId,
	paragraphId,
	onSaved,
	onDismiss,
}: AIImprovePanelProps) {
	const { t } = useTranslation();
	const [editedText, setEditedText] = useState(improveResult.improvedText);
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = useCallback(async () => {
		if (!editedText.trim() || editedText.trim().length < SUGGESTIONS.MIN_LENGTH) return;

		setIsSaving(true);
		try {
			// Update existing suggestion via PUT
			const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					suggestionId,
					suggestedContent: editedText.trim(),
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save improved suggestion');
			}

			onSaved();
		} catch (error) {
			logError(error, {
				operation: 'AIImprovePanel.handleSave',
				paragraphId,
				metadata: { suggestionId },
			});
		} finally {
			setIsSaving(false);
		}
	}, [editedText, paragraphId, suggestionId, onSaved]);

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.badge}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
					</svg>
					{t('AI Improvement')}
				</div>
			</div>

			{/* Changes list */}
			{improveResult.changes.length > 0 && (
				<div className={styles.changesList}>
					<p className={styles.changesTitle}>{t('Changes made')}:</p>
					{improveResult.changes.map((change, i) => (
						<div key={i} className={styles.changeItem}>
							<span className={styles.changeBullet}>•</span>
							<div>
								<span className={styles.changeDescription}>{change.description}</span>
								{change.fromComment && (
									<span className={styles.changeSource}> &mdash; &ldquo;{change.fromComment}&rdquo;</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			<textarea
				className={styles.textarea}
				value={editedText}
				onChange={e => setEditedText(e.target.value)}
				rows={6}
				aria-label={t('Edit improved text')}
			/>

			<div className={styles.actions}>
				<button
					type="button"
					className={styles.saveButton}
					onClick={handleSave}
					disabled={isSaving || !editedText.trim() || editedText.trim().length < SUGGESTIONS.MIN_LENGTH}
				>
					{isSaving ? (
						<>
							<span className={styles.spinner} />
							{t('Saving...')}
						</>
					) : (
						t('Save Improved Version')
					)}
				</button>
				<button
					type="button"
					className={styles.dismissButton}
					onClick={onDismiss}
					disabled={isSaving}
				>
					{t('Dismiss')}
				</button>
			</div>
		</div>
	);
}

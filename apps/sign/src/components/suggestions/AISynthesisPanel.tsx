'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { API_ROUTES, SUGGESTIONS } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';
import styles from './AISynthesisPanel.module.scss';

interface AISynthesisPanelProps {
	synthesisResult: {
		synthesizedText: string;
		reasoning: string;
		sourceSuggestionIds: string[];
	};
	paragraphId: string;
	documentId: string;
	originalContent: string;
	onPublished: () => void;
	onDismiss: () => void;
}

export default function AISynthesisPanel({
	synthesisResult,
	paragraphId,
	documentId,
	originalContent,
	onPublished,
	onDismiss,
}: AISynthesisPanelProps) {
	const { t, tWithParams } = useTranslation();
	const [editedText, setEditedText] = useState(synthesisResult.synthesizedText);
	const [isPublishing, setIsPublishing] = useState(false);
	const [showReasoning, setShowReasoning] = useState(false);

	const handlePublish = useCallback(async () => {
		if (!editedText.trim() || editedText.trim().length < SUGGESTIONS.MIN_LENGTH) return;

		setIsPublishing(true);
		try {
			// Create a new suggestion via the existing suggestions API
			const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					suggestedContent: editedText.trim(),
					reasoning: `AI Synthesis: ${synthesisResult.reasoning}`,
					documentId,
					originalContent,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to publish AI suggestion');
			}

			onPublished();
		} catch (error) {
			logError(error, {
				operation: 'AISynthesisPanel.handlePublish',
				paragraphId,
				metadata: { documentId },
			});
		} finally {
			setIsPublishing(false);
		}
	}, [editedText, paragraphId, documentId, originalContent, synthesisResult.reasoning, onPublished]);

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.badge}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
					</svg>
					{t('AI Synthesis')}
				</div>
				<span className={styles.sourceCount}>
					{tWithParams('Based on community suggestions', { count: synthesisResult.sourceSuggestionIds.length })}
				</span>
			</div>

			<textarea
				className={styles.textarea}
				value={editedText}
				onChange={e => setEditedText(e.target.value)}
				rows={6}
				aria-label={t('Edit synthesized text')}
			/>

			<button
				type="button"
				className={styles.reasoningToggle}
				onClick={() => setShowReasoning(!showReasoning)}
			>
				{showReasoning ? t('Hide AI Reasoning') : t('Show AI Reasoning')}
			</button>

			{showReasoning && (
				<div className={styles.reasoning}>
					<p>{synthesisResult.reasoning}</p>
				</div>
			)}

			<div className={styles.actions}>
				<button
					type="button"
					className={styles.publishButton}
					onClick={handlePublish}
					disabled={isPublishing || !editedText.trim() || editedText.trim().length < SUGGESTIONS.MIN_LENGTH}
				>
					{isPublishing ? (
						<>
							<span className={styles.spinner} />
							{t('Publishing...')}
						</>
					) : (
						t('Publish as AI Suggestion')
					)}
				</button>
				<button
					type="button"
					className={styles.dismissButton}
					onClick={onDismiss}
					disabled={isPublishing}
				>
					{t('Dismiss')}
				</button>
			</div>
		</div>
	);
}

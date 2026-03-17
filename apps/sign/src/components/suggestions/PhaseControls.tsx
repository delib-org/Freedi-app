'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { RefinementPhaseState } from '@/hooks/useRefinementPhase';
import styles from './PhaseControls.module.scss';

interface PhaseControlsProps {
	paragraphId: string;
	refinement: RefinementPhaseState;
	suggestions: SuggestionType[];
	originalContent: string;
	onSynthesize: (
		paragraphId: string,
		originalContent: string,
		suggestions: Array<{
			suggestionId: string;
			suggestedContent: string;
			consensus: number;
			creatorDisplayName: string;
		}>,
	) => Promise<{ synthesizedText: string; reasoning: string; sourceSuggestionIds: string[] } | null>;
	onSetPhase: (paragraphId: string, phase: 'open' | 'refinement', threshold?: number) => Promise<boolean>;
	isLoading: boolean;
}

export default function PhaseControls({
	paragraphId,
	refinement,
	suggestions,
	originalContent,
	onSynthesize,
	onSetPhase,
	isLoading,
}: PhaseControlsProps) {
	const { t, tWithParams } = useTranslation();
	const [threshold, setThreshold] = useState(refinement.consensusThreshold ?? 0.2);
	const [showPreview, setShowPreview] = useState(false);

	const isRefinement = refinement.phase === 'refinement';

	// Filter suggestions above threshold
	const aboveThreshold = suggestions.filter(s => s.consensus >= threshold);

	const handleSynthesize = useCallback(async () => {
		const input = aboveThreshold.map(s => ({
			suggestionId: s.suggestionId,
			suggestedContent: s.suggestedContent,
			consensus: s.consensus,
			creatorDisplayName: s.creatorDisplayName,
		}));
		await onSynthesize(paragraphId, originalContent, input);
	}, [paragraphId, originalContent, aboveThreshold, onSynthesize]);

	const handleEnterRefinement = useCallback(async () => {
		await onSetPhase(paragraphId, 'refinement', threshold);
	}, [paragraphId, threshold, onSetPhase]);

	const handleExitRefinement = useCallback(async () => {
		await onSetPhase(paragraphId, 'open');
	}, [paragraphId, onSetPhase]);

	return (
		<div className={styles.phaseControls}>
			{/* Phase indicator */}
			<div className={styles.phaseHeader}>
				<span className={`${styles.phasePill} ${isRefinement ? styles['phasePill--refinement'] : styles['phasePill--open']}`}>
					{isRefinement ? t('Refinement') : t('Open')}
				</span>
				<span className={styles.phaseLabel}>
					{isRefinement
						? t('Low-consensus suggestions are hidden')
						: t('All suggestions visible')
					}
				</span>
			</div>

			{/* Action buttons */}
			<div className={styles.actions}>
				{!isRefinement && (
					<>
						<button
							type="button"
							className={styles.synthesizeButton}
							onClick={() => setShowPreview(!showPreview)}
							disabled={suggestions.length === 0 || isLoading}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 2L2 7l10 5 10-5-10-5z" />
								<path d="M2 17l10 5 10-5" />
								<path d="M2 12l10 5 10-5" />
							</svg>
							{t('Synthesize with AI')}
						</button>
						<button
							type="button"
							className={styles.phaseButton}
							onClick={handleEnterRefinement}
							disabled={isLoading}
						>
							{t('Enter Refinement Phase')}
						</button>
					</>
				)}
				{isRefinement && (
					<button
						type="button"
						className={`${styles.phaseButton} ${styles['phaseButton--exit']}`}
						onClick={handleExitRefinement}
						disabled={isLoading}
					>
						{t('End Refinement')}
					</button>
				)}
			</div>

			{/* Synthesis preview panel */}
			{showPreview && !isRefinement && (
				<div className={styles.previewPanel}>
					<div className={styles.thresholdControl}>
						<label className={styles.thresholdLabel} htmlFor="consensus-threshold">
							{t('Consensus threshold')}: {(threshold * 100).toFixed(0)}%
						</label>
						<input
							id="consensus-threshold"
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={threshold}
							onChange={e => setThreshold(parseFloat(e.target.value))}
							className={styles.thresholdSlider}
						/>
					</div>

					<div className={styles.previewList}>
						<p className={styles.previewCount}>
							{tWithParams('suggestions above threshold', { count: aboveThreshold.length, total: suggestions.length })}
						</p>
						{aboveThreshold.map(s => (
							<div key={s.suggestionId} className={styles.previewItem}>
								<span className={styles.previewConsensus}>{(s.consensus * 100).toFixed(0)}%</span>
								<span className={styles.previewText}>{s.suggestedContent.substring(0, 100)}...</span>
							</div>
						))}
					</div>

					<button
						type="button"
						className={styles.generateButton}
						onClick={handleSynthesize}
						disabled={aboveThreshold.length === 0 || isLoading}
					>
						{isLoading ? (
							<>
								<span className={styles.spinner} />
								{t('Generating...')}
							</>
						) : (
							<>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
								</svg>
								{t('Generate Synthesis')}
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
}

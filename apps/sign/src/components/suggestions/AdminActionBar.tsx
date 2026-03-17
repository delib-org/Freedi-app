'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { SUGGESTIONS } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';
import styles from './AdminActionBar.module.scss';

type ActionBarMode =
	| { type: 'status' }
	| { type: 'reviewing'; suggestion: SuggestionType }
	| { type: 'synthesizing' }
	| { type: 'editSynthesis'; text: string; reasoning: string }
	| { type: 'mergeInstructions' }
	| { type: 'merging' }
	| { type: 'editMerge'; text: string; reasoning: string; sourceSuggestionIds: string[] }
	| { type: 'success'; message: string };

interface AdminActionBarProps {
	paragraphId: string;
	documentId: string;
	originalContent: string;
	suggestions: SuggestionType[];
	enableRefinement: boolean;
	onSynthesize: (
		paragraphId: string,
		originalContent: string,
		suggestions: Array<{
			suggestionId: string;
			suggestedContent: string;
			consensus: number;
			creatorDisplayName: string;
		}>,
		customInstructions?: string,
	) => Promise<{ synthesizedText: string; reasoning: string; sourceSuggestionIds: string[] } | null>;
	onSetPhase: (paragraphId: string, phase: 'open' | 'refinement', threshold?: number) => Promise<boolean>;
	isAILoading: boolean;
	/** Whether selection mode is active */
	selectionMode: boolean;
	/** Set of selected suggestion IDs */
	selectedIds: Set<string>;
	/** Enter selection mode */
	onEnterSelectionMode: () => void;
	/** Exit selection mode and clear selections */
	onClearSelection: () => void;
	/** Publish merged text as a new suggestion */
	onPublishMerge: (
		paragraphId: string,
		documentId: string,
		mergedText: string,
		reasoning: string,
		sourceSuggestionIds: string[],
	) => Promise<boolean>;
	/** Hide all unselected suggestions (show only selected) */
	onShowOnlySelected: (selectedIds: Set<string>) => Promise<boolean>;
	/** Unhide all suggestions */
	onShowAll: () => Promise<boolean>;
	/** Whether some suggestions are currently admin-hidden */
	hasHiddenSuggestions: boolean;
}

const CONSENSUS_THRESHOLD = 0.3;
const SUCCESS_DISPLAY_MS = 2000;

export default function AdminActionBar({
	paragraphId,
	documentId,
	originalContent,
	suggestions,
	enableRefinement,
	onSynthesize,
	onSetPhase,
	isAILoading,
	selectionMode,
	selectedIds,
	onEnterSelectionMode,
	onClearSelection,
	onPublishMerge,
	onShowOnlySelected,
	onShowAll,
	hasHiddenSuggestions,
}: AdminActionBarProps) {
	const { t } = useTranslation();
	const [mode, setMode] = useState<ActionBarMode>({ type: 'status' });
	const [isAccepting, setIsAccepting] = useState(false);
	const [showOverflow, setShowOverflow] = useState(false);

	// Get top suggestion by consensus
	const topSuggestion = useMemo(() => {
		if (suggestions.length === 0) return null;

		return [...suggestions].sort((a, b) => (b.consensus || 0) - (a.consensus || 0))[0];
	}, [suggestions]);

	const topConsensus = topSuggestion?.consensus || 0;
	const hasActionableConsensus = topConsensus >= CONSENSUS_THRESHOLD;

	// Status text
	const statusText = useMemo(() => {
		if (suggestions.length === 0) return t('No suggestions yet');

		const consensusPct = Math.round(topConsensus * 100);

		return `${suggestions.length} ${suggestions.length === 1 ? t('suggestion') : t('Suggestions').toLowerCase()} · ${t('Top consensus')}: ${consensusPct}%`;
	}, [suggestions.length, topConsensus, t]);

	// Handle "Accept Top" click
	const handleAcceptTop = useCallback(() => {
		if (!topSuggestion) return;
		setMode({ type: 'reviewing', suggestion: topSuggestion });
	}, [topSuggestion]);

	// Handle confirming acceptance
	const handleConfirmAccept = useCallback(async (suggestion: SuggestionType) => {
		setIsAccepting(true);
		try {
			const response = await fetch(`/api/admin/suggestions/${suggestion.suggestionId}/accept`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId, paragraphId }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to accept suggestion');
			}

			setMode({ type: 'success', message: t('Suggestion accepted') });
			setTimeout(() => setMode({ type: 'status' }), SUCCESS_DISPLAY_MS);
		} catch (error) {
			logError(error, {
				operation: 'AdminActionBar.handleConfirmAccept',
				metadata: { paragraphId, suggestionId: suggestion.suggestionId },
			});
			setMode({ type: 'status' });
		} finally {
			setIsAccepting(false);
		}
	}, [documentId, paragraphId, t]);

	// Handle "AI Synthesize" click
	const handleSynthesize = useCallback(async () => {
		setMode({ type: 'synthesizing' });

		const input = suggestions
			.filter(s => s.consensus >= CONSENSUS_THRESHOLD || suggestions.length <= 3)
			.sort((a, b) => (b.consensus || 0) - (a.consensus || 0))
			.slice(0, 10)
			.map(s => ({
				suggestionId: s.suggestionId,
				suggestedContent: s.suggestedContent,
				consensus: s.consensus,
				creatorDisplayName: s.creatorDisplayName,
			}));

		const result = await onSynthesize(paragraphId, originalContent, input);

		if (result) {
			setMode({
				type: 'editSynthesis',
				text: result.synthesizedText,
				reasoning: result.reasoning,
			});
		} else {
			setMode({ type: 'status' });
		}
	}, [suggestions, paragraphId, originalContent, onSynthesize]);

	// Handle "AI Merge" click — open instructions panel
	const handleStartMerge = useCallback(() => {
		setMode({ type: 'mergeInstructions' });
	}, []);

	// Handle "Generate Merge" from instructions panel
	const handleGenerateMerge = useCallback(async (customInstructions: string) => {
		setMode({ type: 'merging' });

		const selectedSuggestions = suggestions
			.filter(s => selectedIds.has(s.suggestionId))
			.map(s => ({
				suggestionId: s.suggestionId,
				suggestedContent: s.suggestedContent,
				consensus: s.consensus,
				creatorDisplayName: s.creatorDisplayName,
			}));

		const instructions = customInstructions.trim() || undefined;
		const result = await onSynthesize(paragraphId, originalContent, selectedSuggestions, instructions);

		if (result) {
			setMode({
				type: 'editMerge',
				text: result.synthesizedText,
				reasoning: result.reasoning,
				sourceSuggestionIds: result.sourceSuggestionIds,
			});
		} else {
			setMode({ type: 'status' });
			onClearSelection();
		}
	}, [suggestions, selectedIds, paragraphId, originalContent, onSynthesize, onClearSelection]);

	// Handle accepting synthesis — creates suggestion + accepts in one API call
	const handleAcceptSynthesis = useCallback(async (text: string) => {
		if (!text.trim() || text.trim().length < SUGGESTIONS.MIN_LENGTH) return;

		setIsAccepting(true);
		try {
			const reasoning = mode.type === 'editSynthesis' ? mode.reasoning : '';

			const response = await fetch('/api/admin/suggestions/accept-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					documentId,
					paragraphId,
					proposedText: text.trim(),
					reasoning: `AI Synthesis: ${reasoning}`,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to accept synthesis');
			}

			setMode({ type: 'success', message: t('Synthesis accepted') });
			setTimeout(() => setMode({ type: 'status' }), SUCCESS_DISPLAY_MS);
		} catch (error) {
			logError(error, {
				operation: 'AdminActionBar.handleAcceptSynthesis',
				metadata: { paragraphId },
			});
			setMode({ type: 'status' });
		} finally {
			setIsAccepting(false);
		}
	}, [paragraphId, documentId, mode, t]);

	// Handle publishing merge as a new suggestion
	const handlePublishMerge = useCallback(async (text: string) => {
		if (!text.trim() || text.trim().length < SUGGESTIONS.MIN_LENGTH) return;
		if (mode.type !== 'editMerge') return;

		setIsAccepting(true);
		try {
			const success = await onPublishMerge(
				paragraphId,
				documentId,
				text.trim(),
				`AI Merge: ${mode.reasoning}`,
				mode.sourceSuggestionIds,
			);

			if (success) {
				setMode({ type: 'success', message: t('Merge published as suggestion') });
				onClearSelection();
				setTimeout(() => setMode({ type: 'status' }), SUCCESS_DISPLAY_MS);
			} else {
				setMode({ type: 'status' });
			}
		} catch (error) {
			logError(error, {
				operation: 'AdminActionBar.handlePublishMerge',
				metadata: { paragraphId },
			});
			setMode({ type: 'status' });
		} finally {
			setIsAccepting(false);
		}
	}, [paragraphId, documentId, mode, t, onPublishMerge, onClearSelection]);

	// Handle "Show Only Selected" - hide all unselected suggestions
	const handleShowOnlySelected = useCallback(async () => {
		setIsAccepting(true);
		try {
			const success = await onShowOnlySelected(selectedIds);
			if (success) {
				setMode({ type: 'success', message: t('Showing selected suggestions only') });
				onClearSelection();
				setTimeout(() => setMode({ type: 'status' }), SUCCESS_DISPLAY_MS);
			}
		} catch (error) {
			logError(error, {
				operation: 'AdminActionBar.handleShowOnlySelected',
				metadata: { paragraphId, selectedCount: selectedIds.size },
			});
		} finally {
			setIsAccepting(false);
		}
	}, [selectedIds, paragraphId, onShowOnlySelected, onClearSelection, t]);

	// Handle "Show All" - unhide all suggestions
	const handleShowAll = useCallback(async () => {
		setIsAccepting(true);
		try {
			const success = await onShowAll();
			if (success) {
				setMode({ type: 'success', message: t('All suggestions are now visible') });
				setTimeout(() => setMode({ type: 'status' }), SUCCESS_DISPLAY_MS);
			}
		} catch (error) {
			logError(error, {
				operation: 'AdminActionBar.handleShowAll',
				metadata: { paragraphId },
			});
		} finally {
			setIsAccepting(false);
		}
	}, [paragraphId, onShowAll, t]);

	// Handle entering refinement phase
	const handleEnterRefinement = useCallback(async () => {
		setShowOverflow(false);
		await onSetPhase(paragraphId, 'refinement');
	}, [paragraphId, onSetPhase]);

	return (
		<div className={styles.bar}>
			{/* Filter active banner — always visible when suggestions are hidden */}
			{hasHiddenSuggestions && mode.type === 'status' && !selectionMode && (
				<div className={styles.filterBanner} role="status" aria-live="polite">
					<div className={styles.filterBannerContent}>
						<svg className={styles.filterIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
						</svg>
						<div className={styles.filterText}>
							<span className={styles.filterTitle}>{t('Filtered view')}</span>
							<span className={styles.filterDesc}>{t('Some suggestions are hidden from users')}</span>
						</div>
					</div>
					<button
						type="button"
						className={styles.showAllInline}
						onClick={handleShowAll}
						disabled={isAccepting}
					>
						{t('Show All')}
					</button>
				</div>
			)}

			{/* Status mode */}
			{mode.type === 'status' && (
				<>
					<div className={styles.statusLine}>
						<svg className={styles.statusIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
						</svg>
						<span className={styles.statusText}>{statusText}</span>
					</div>

					{/* Selection mode toolbar */}
					{selectionMode && (
						<div className={styles.selectionInfo}>
							<div className={styles.selectionHeader}>
								<span className={styles.selectionCount}>
									{selectedIds.size} {t('selected')}
								</span>
								<button
									type="button"
									className={styles.cancelIcon}
									onClick={onClearSelection}
									aria-label={t('Exit selection mode')}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							</div>
							{selectedIds.size === 0 && (
								<span className={styles.selectionHint}>
									{t('Tap suggestions to select them')}
								</span>
							)}
							{selectedIds.size >= 1 && (
								<div className={styles.selectionActions}>
									<button
										type="button"
										className={styles.showOnlyButton}
										onClick={handleShowOnlySelected}
										disabled={isAccepting}
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
											<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
											<circle cx="12" cy="12" r="3" />
										</svg>
										{t('Show Only Selected')}
									</button>
									{selectedIds.size >= 2 && (
										<button
											type="button"
											className={styles.mergeButton}
											onClick={handleStartMerge}
											disabled={isAILoading}
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
											</svg>
											{t('AI Merge')} ({selectedIds.size})
										</button>
									)}
								</div>
							)}
						</div>
					)}

					{/* Normal action buttons (hidden during selection mode) */}
					{!selectionMode && suggestions.length > 0 && (
						<div className={styles.actions}>
							{hasActionableConsensus && (
								<>
									<button
										type="button"
										className={styles.acceptTopButton}
										onClick={handleAcceptTop}
										disabled={isAILoading}
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
											<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
										</svg>
										{suggestions.length === 1 ? t('Accept') : t('Accept Top')}
									</button>
									{suggestions.length >= 2 && (
										<button
											type="button"
											className={styles.synthesizeButton}
											onClick={handleSynthesize}
											disabled={isAILoading}
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
											</svg>
											{t('AI Synthesize')}
										</button>
									)}
								</>
							)}
							<button
								type="button"
								className={styles.selectButton}
								onClick={onEnterSelectionMode}
								disabled={isAILoading}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<rect x="3" y="3" width="7" height="7" rx="1" />
									<rect x="3" y="14" width="7" height="7" rx="1" />
									<path d="M14 5h7M14 16h7" />
								</svg>
								{t('Select')}
							</button>
							{enableRefinement && (
								<div className={styles.overflowWrapper}>
									<button
										type="button"
										className={styles.overflowButton}
										onClick={() => setShowOverflow(!showOverflow)}
										aria-label={t('More options')}
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
										</svg>
									</button>
									{showOverflow && (
										<div className={styles.overflowMenu}>
											<button
												type="button"
												className={styles.overflowItem}
												onClick={handleEnterRefinement}
											>
												{t('Enter Refinement Phase')}
											</button>
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{/* Waiting line (hidden during selection mode) */}
					{!selectionMode && !hasActionableConsensus && suggestions.length > 0 && !suggestions.some(() => true && suggestions.length < 2) && (
						<div className={styles.waitingLine}>
							{t('Waiting for more community input')}
						</div>
					)}
				</>
			)}

			{/* Merge instructions mode — admin provides optional guidance */}
			{mode.type === 'mergeInstructions' && (
				<MergeInstructionsPanel
					selectedCount={selectedIds.size}
					isLoading={isAILoading}
					onGenerate={handleGenerateMerge}
					onBack={() => setMode({ type: 'status' })}
				/>
			)}

			{/* Reviewing mode - inline diff */}
			{mode.type === 'reviewing' && (
				<div className={styles.reviewPanel}>
					<div className={styles.reviewHeader}>
						{t('Review: Accept this suggestion?')}
					</div>
					<div className={styles.diffView}>
						<div className={styles.diffOld}>
							<span className={styles.diffLabel}>{t('Current')}:</span>
							<p>{originalContent}</p>
						</div>
						<div className={styles.diffNew}>
							<span className={styles.diffLabel}>{t('New')}:</span>
							<p>{mode.suggestion.suggestedContent}</p>
						</div>
					</div>
					<div className={styles.reviewActions}>
						<button
							type="button"
							className={styles.confirmButton}
							onClick={() => handleConfirmAccept(mode.suggestion)}
							disabled={isAccepting}
						>
							{isAccepting ? (
								<><span className={styles.spinner} /> {t('Accepting...')}</>
							) : (
								<>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
										<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
									</svg>
									{t('Confirm Accept')}
								</>
							)}
						</button>
						<button
							type="button"
							className={styles.cancelButton}
							onClick={() => setMode({ type: 'status' })}
							disabled={isAccepting}
						>
							{t('Cancel')}
						</button>
					</div>
				</div>
			)}

			{/* Synthesizing mode - loading */}
			{mode.type === 'synthesizing' && (
				<div className={styles.synthesizingPanel}>
					<div className={styles.synthesizingHeader}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
						</svg>
						{t('AI Synthesis')}
					</div>
					<div className={styles.loadingState}>
						<span className={styles.spinner} />
						<span>{t('Combining top suggestions...')}</span>
					</div>
				</div>
			)}

			{/* Merging mode - loading */}
			{mode.type === 'merging' && (
				<div className={styles.synthesizingPanel}>
					<div className={styles.synthesizingHeader}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
						</svg>
						{t('AI Merge')}
					</div>
					<div className={styles.loadingState}>
						<span className={styles.spinner} />
						<span>{t('Merging selected suggestions...')}</span>
					</div>
				</div>
			)}

			{/* Edit Synthesis mode */}
			{mode.type === 'editSynthesis' && (
				<EditSynthesisPanel
					initialText={mode.text}
					reasoning={mode.reasoning}
					isAccepting={isAccepting}
					onAccept={handleAcceptSynthesis}
					onCancel={() => setMode({ type: 'status' })}
					headerLabel={t('AI Synthesis')}
					confirmLabel={t('Accept Synthesis')}
					acceptingLabel={t('Accepting...')}
				/>
			)}

			{/* Edit Merge mode */}
			{mode.type === 'editMerge' && (
				<EditSynthesisPanel
					initialText={mode.text}
					reasoning={mode.reasoning}
					isAccepting={isAccepting}
					onAccept={handlePublishMerge}
					onCancel={() => {
						setMode({ type: 'status' });
						onClearSelection();
					}}
					headerLabel={t('AI Merge')}
					confirmLabel={t('Publish as Suggestion')}
					acceptingLabel={t('Publishing...')}
				/>
			)}

			{/* Success mode */}
			{mode.type === 'success' && (
				<div className={styles.successBar}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
						<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
					</svg>
					<span>{mode.message}</span>
				</div>
			)}
		</div>
	);
}

/** Merge instructions panel — lets admin optionally guide the AI */
function MergeInstructionsPanel({
	selectedCount,
	isLoading,
	onGenerate,
	onBack,
}: {
	selectedCount: number;
	isLoading: boolean;
	onGenerate: (instructions: string) => void;
	onBack: () => void;
}) {
	const { t } = useTranslation();
	const [instructions, setInstructions] = useState('');

	return (
		<div className={styles.mergeInstructionsPanel}>
			<div className={styles.mergeInstructionsHeader}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
				</svg>
				{t('AI Merge')} ({selectedCount} {t('selected')})
			</div>

			<textarea
				className={styles.instructionsTextarea}
				value={instructions}
				onChange={e => setInstructions(e.target.value)}
				placeholder={t('Optional: Guide the AI')}
				rows={3}
				aria-label={t('Custom instructions for AI merge')}
			/>

			<div className={styles.mergeInstructionsActions}>
				<button
					type="button"
					className={styles.confirmButton}
					onClick={() => onGenerate(instructions)}
					disabled={isLoading}
				>
					{isLoading ? (
						<><span className={styles.spinner} /> {t('Generating...')}</>
					) : (
						<>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
							</svg>
							{t('Generate Merge')}
						</>
					)}
				</button>
				<button
					type="button"
					className={styles.cancelButton}
					onClick={onBack}
					disabled={isLoading}
				>
					{t('Back')}
				</button>
			</div>
		</div>
	);
}

/** Extracted so textarea state is independent from parent rerenders */
function EditSynthesisPanel({
	initialText,
	reasoning,
	isAccepting,
	onAccept,
	onCancel,
	headerLabel,
	confirmLabel,
	acceptingLabel,
}: {
	initialText: string;
	reasoning: string;
	isAccepting: boolean;
	onAccept: (text: string) => void;
	onCancel: () => void;
	headerLabel: string;
	confirmLabel: string;
	acceptingLabel: string;
}) {
	const { t } = useTranslation();
	const [editedText, setEditedText] = useState(initialText);
	const [showReasoning, setShowReasoning] = useState(false);

	return (
		<div className={styles.synthesisPanel}>
			<div className={styles.synthesisHeader}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
				</svg>
				{headerLabel}
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
					<p>{reasoning}</p>
				</div>
			)}

			<div className={styles.synthesisActions}>
				<button
					type="button"
					className={styles.confirmButton}
					onClick={() => onAccept(editedText)}
					disabled={isAccepting || !editedText.trim() || editedText.trim().length < SUGGESTIONS.MIN_LENGTH}
				>
					{isAccepting ? (
						<><span className={styles.spinner} /> {acceptingLabel}</>
					) : (
						<>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
							</svg>
							{confirmLabel}
						</>
					)}
				</button>
				<button
					type="button"
					className={styles.cancelButton}
					onClick={onCancel}
					disabled={isAccepting}
				>
					{t('Cancel')}
				</button>
			</div>
		</div>
	);
}

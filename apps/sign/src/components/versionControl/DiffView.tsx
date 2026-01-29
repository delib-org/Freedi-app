'use client';

import React, { useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './diffView.module.scss';

interface DiffViewProps {
	currentText: string;
	proposedText: string;
	mode?: 'inline' | 'sideBySide' | 'compact';
	maxLines?: number;
	showLineNumbers?: boolean;
	highlightWords?: boolean;
}

interface DiffSegment {
	type: 'unchanged' | 'added' | 'removed';
	text: string;
}

/**
 * DiffView Component - Visualizes changes between two text versions
 *
 * Design improvements:
 * 1. Clear color coding: green for additions, red for removals
 * 2. Word-level diff for precise change tracking
 * 3. Multiple display modes for different contexts
 * 4. Accessible with screen reader support
 * 5. Handles HTML content by stripping tags for comparison
 */
export function DiffView({
	currentText,
	proposedText,
	mode = 'inline',
	maxLines,
	showLineNumbers = false,
	highlightWords = true,
}: DiffViewProps) {
	const { t } = useTranslation();

	// Strip HTML tags for text comparison
	const cleanCurrentText = stripHtml(currentText);
	const cleanProposedText = stripHtml(proposedText);

	// Compute the diff
	const diff = useMemo(() => {
		if (highlightWords) {
			return computeWordDiff(cleanCurrentText, cleanProposedText);
		}
		return computeCharDiff(cleanCurrentText, cleanProposedText);
	}, [cleanCurrentText, cleanProposedText, highlightWords]);

	// Calculate summary stats
	const stats = useMemo(() => {
		const added = diff.filter(s => s.type === 'added').reduce((acc, s) => acc + s.text.length, 0);
		const removed = diff.filter(s => s.type === 'removed').reduce((acc, s) => acc + s.text.length, 0);
		const unchanged = diff.filter(s => s.type === 'unchanged').reduce((acc, s) => acc + s.text.length, 0);
		const total = added + removed + unchanged;
		const changePercent = total > 0 ? Math.round(((added + removed) / total) * 100) : 0;
		return { added, removed, unchanged, changePercent };
	}, [diff]);

	// Check if texts are identical
	const isIdentical = cleanCurrentText === cleanProposedText;

	if (isIdentical) {
		return (
			<div className={styles.diff}>
				<div className={styles.diff__identical}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					{t('No changes detected')}
				</div>
			</div>
		);
	}

	// Render based on mode
	if (mode === 'compact') {
		return (
			<div className={styles.diff} role="region" aria-label={t('Change preview')}>
				{renderCompactDiff(diff, maxLines, t)}
				<div className={styles.diff__stats}>
					<span className={styles.diff__statAdded}>+{stats.added}</span>
					<span className={styles.diff__statRemoved}>-{stats.removed}</span>
					<span className={styles.diff__statPercent}>{stats.changePercent}% {t('changed')}</span>
				</div>
			</div>
		);
	}

	if (mode === 'sideBySide') {
		return (
			<div className={`${styles.diff} ${styles['diff--sideBySide']}`} role="region" aria-label={t('Side by side comparison')}>
				<div className={styles.diff__column}>
					<h5 className={styles.diff__columnHeader}>
						<span className={styles['diff__columnHeader--removed']}>{t('Current Version')}</span>
					</h5>
					<div className={styles.diff__content}>
						{renderSideBySideCurrent(diff, showLineNumbers)}
					</div>
				</div>
				<div className={styles.diff__column}>
					<h5 className={styles.diff__columnHeader}>
						<span className={styles['diff__columnHeader--added']}>{t('Proposed Version')}</span>
					</h5>
					<div className={styles.diff__content}>
						{renderSideBySideProposed(diff, showLineNumbers)}
					</div>
				</div>
			</div>
		);
	}

	// Inline mode (default)
	return (
		<div className={styles.diff} role="region" aria-label={t('Inline change view')}>
			<div className={styles.diff__summary}>
				<span className={styles.diff__statAdded}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					{stats.added} {t('added')}
				</span>
				<span className={styles.diff__statRemoved}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					{stats.removed} {t('removed')}
				</span>
				<span className={styles.diff__statPercent}>
					{stats.changePercent}% {t('of text changed')}
				</span>
			</div>

			<div className={styles.diff__inline}>
				{diff.map((segment, index) => (
					<span
						key={index}
						className={`${styles.diff__segment} ${styles[`diff__segment--${segment.type}`]}`}
						aria-label={segment.type !== 'unchanged' ? t(segment.type) : undefined}
					>
						{segment.text}
					</span>
				))}
			</div>
		</div>
	);
}

/**
 * Render compact diff with truncation
 */
function renderCompactDiff(
	diff: DiffSegment[],
	maxLines: number | undefined,
	_t: (key: string) => string
): React.ReactNode {
	// Join text and truncate if needed
	let totalLength = 0;
	const maxChars = maxLines ? maxLines * 80 : Infinity;
	const truncatedDiff: DiffSegment[] = [];

	for (const segment of diff) {
		if (totalLength >= maxChars) break;

		if (totalLength + segment.text.length > maxChars) {
			truncatedDiff.push({
				...segment,
				text: segment.text.slice(0, maxChars - totalLength) + '...',
			});
			break;
		}

		truncatedDiff.push(segment);
		totalLength += segment.text.length;
	}

	return (
		<div className={styles.diff__compact}>
			{truncatedDiff.map((segment, index) => (
				<span
					key={index}
					className={`${styles.diff__segment} ${styles[`diff__segment--${segment.type}`]}`}
				>
					{segment.text}
				</span>
			))}
		</div>
	);
}

/**
 * Render current text for side-by-side view
 */
function renderSideBySideCurrent(diff: DiffSegment[], showLineNumbers: boolean): React.ReactNode {
	const segments = diff.filter(s => s.type !== 'added');

	return (
		<div className={styles.diff__text}>
			{showLineNumbers && <span className={styles.diff__lineNumber}>1</span>}
			{segments.map((segment, index) => (
				<span
					key={index}
					className={`${styles.diff__segment} ${segment.type === 'removed' ? styles['diff__segment--removed'] : ''}`}
				>
					{segment.text}
				</span>
			))}
		</div>
	);
}

/**
 * Render proposed text for side-by-side view
 */
function renderSideBySideProposed(diff: DiffSegment[], showLineNumbers: boolean): React.ReactNode {
	const segments = diff.filter(s => s.type !== 'removed');

	return (
		<div className={styles.diff__text}>
			{showLineNumbers && <span className={styles.diff__lineNumber}>1</span>}
			{segments.map((segment, index) => (
				<span
					key={index}
					className={`${styles.diff__segment} ${segment.type === 'added' ? styles['diff__segment--added'] : ''}`}
				>
					{segment.text}
				</span>
			))}
		</div>
	);
}

/**
 * Strip HTML tags from text for comparison
 */
function stripHtml(html: string): string {
	// Create a temporary element to parse HTML
	if (typeof window !== 'undefined') {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		return doc.body.textContent || '';
	}
	// Server-side fallback - basic regex strip
	return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/**
 * Compute word-level diff between two texts
 * Uses a simple LCS-based algorithm
 */
function computeWordDiff(current: string, proposed: string): DiffSegment[] {
	const currentWords = current.split(/(\s+)/);
	const proposedWords = proposed.split(/(\s+)/);

	const result: DiffSegment[] = [];

	// Simple diff algorithm - can be improved with proper LCS
	let i = 0;
	let j = 0;

	while (i < currentWords.length || j < proposedWords.length) {
		if (i >= currentWords.length) {
			// All remaining proposed words are additions
			result.push({ type: 'added', text: proposedWords.slice(j).join('') });
			break;
		}

		if (j >= proposedWords.length) {
			// All remaining current words are removals
			result.push({ type: 'removed', text: currentWords.slice(i).join('') });
			break;
		}

		if (currentWords[i] === proposedWords[j]) {
			// Words match
			result.push({ type: 'unchanged', text: currentWords[i] });
			i++;
			j++;
		} else {
			// Find next matching word in proposed
			let foundInProposed = -1;
			for (let k = j + 1; k < Math.min(j + 10, proposedWords.length); k++) {
				if (proposedWords[k] === currentWords[i]) {
					foundInProposed = k;
					break;
				}
			}

			// Find next matching word in current
			let foundInCurrent = -1;
			for (let k = i + 1; k < Math.min(i + 10, currentWords.length); k++) {
				if (currentWords[k] === proposedWords[j]) {
					foundInCurrent = k;
					break;
				}
			}

			if (foundInProposed !== -1 && (foundInCurrent === -1 || foundInProposed - j < foundInCurrent - i)) {
				// Addition found
				result.push({ type: 'added', text: proposedWords.slice(j, foundInProposed).join('') });
				j = foundInProposed;
			} else if (foundInCurrent !== -1) {
				// Removal found
				result.push({ type: 'removed', text: currentWords.slice(i, foundInCurrent).join('') });
				i = foundInCurrent;
			} else {
				// No match found nearby - treat as replacement
				result.push({ type: 'removed', text: currentWords[i] });
				result.push({ type: 'added', text: proposedWords[j] });
				i++;
				j++;
			}
		}
	}

	// Merge consecutive segments of same type
	return mergeSegments(result);
}

/**
 * Compute character-level diff (for when word diff is disabled)
 */
function computeCharDiff(current: string, proposed: string): DiffSegment[] {
	// Simple character comparison - for short texts
	if (current === proposed) {
		return [{ type: 'unchanged', text: current }];
	}

	// Find common prefix
	let prefixLength = 0;
	while (prefixLength < current.length && prefixLength < proposed.length && current[prefixLength] === proposed[prefixLength]) {
		prefixLength++;
	}

	// Find common suffix
	let suffixLength = 0;
	while (
		suffixLength < current.length - prefixLength &&
		suffixLength < proposed.length - prefixLength &&
		current[current.length - 1 - suffixLength] === proposed[proposed.length - 1 - suffixLength]
	) {
		suffixLength++;
	}

	const result: DiffSegment[] = [];

	if (prefixLength > 0) {
		result.push({ type: 'unchanged', text: current.slice(0, prefixLength) });
	}

	const removedText = current.slice(prefixLength, current.length - suffixLength);
	const addedText = proposed.slice(prefixLength, proposed.length - suffixLength);

	if (removedText) {
		result.push({ type: 'removed', text: removedText });
	}
	if (addedText) {
		result.push({ type: 'added', text: addedText });
	}

	if (suffixLength > 0) {
		result.push({ type: 'unchanged', text: current.slice(current.length - suffixLength) });
	}

	return result;
}

/**
 * Merge consecutive segments of the same type
 */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
	if (segments.length === 0) return [];

	const merged: DiffSegment[] = [segments[0]];

	for (let i = 1; i < segments.length; i++) {
		const last = merged[merged.length - 1];
		const current = segments[i];

		if (last.type === current.type) {
			last.text += current.text;
		} else {
			merged.push(current);
		}
	}

	return merged;
}

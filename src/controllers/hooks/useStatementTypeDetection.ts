import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { detectStatementTypeWithTimeout } from '@/services/statementTypeDetection';
import { logError } from '@/utils/errorHandling';
import { TIME } from '@/constants/common';
import { statementSelectorById } from '@/redux/statements/statementsSlice';

const STORAGE_KEY = 'freedi_dismissed_type_suggestions';
const MAX_DISMISSED_ENTRIES = 200;
const MIN_CONFIDENCE = 0.7;
const DETECTION_DELAY_MS = 1500;
const MAX_STATEMENT_AGE_MS = TIME.DAY;

interface TypeDetectionState {
	suggestedType: StatementType.question | StatementType.option | null;
	isVisible: boolean;
}

/**
 * Get dismissed statement IDs from localStorage
 */
function getDismissedIds(): Set<string> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const ids: string[] = JSON.parse(stored);

			return new Set(ids);
		}
	} catch {
		// Graceful fallback
	}

	return new Set();
}

/**
 * Add a statement ID to dismissed list in localStorage
 */
function addDismissedId(statementId: string): void {
	try {
		const ids = getDismissedIds();
		ids.add(statementId);

		// Keep max entries (FIFO)
		const idsArray = Array.from(ids);
		if (idsArray.length > MAX_DISMISSED_ENTRIES) {
			idsArray.splice(0, idsArray.length - MAX_DISMISSED_ENTRIES);
		}

		localStorage.setItem(STORAGE_KEY, JSON.stringify(idsArray));
	} catch {
		// Graceful fallback - dismissed state won't persist
	}
}

/**
 * Hook to detect if a statement should be suggested as a question or solution.
 * Only activates for the creator's own statements of type 'statement'.
 */
export function useStatementTypeDetection(
	statement: Statement,
	isMe: boolean,
): TypeDetectionState & { dismiss: () => void } {
	const parentStatement = useSelector(statementSelectorById(statement.parentId));

	const [state, setState] = useState<TypeDetectionState>({
		suggestedType: null,
		isVisible: false,
	});

	const dismiss = useCallback(() => {
		addDismissedId(statement.statementId);
		setState({ suggestedType: null, isVisible: false });
	}, [statement.statementId]);

	useEffect(() => {
		// Only detect for creator's own generic statements
		if (!isMe) return;
		if (statement.statementType !== StatementType.statement) return;

		// Don't show for old statements
		const age = Date.now() - statement.createdAt;
		if (age > MAX_STATEMENT_AGE_MS) return;

		// Check if already dismissed
		if (getDismissedIds().has(statement.statementId)) return;

		// Don't detect very short statements
		if (!statement.statement || statement.statement.length < 5) return;

		let cancelled = false;

		const timer = setTimeout(async () => {
			try {
				const result = await detectStatementTypeWithTimeout(
					statement.statement,
					statement.parentId,
				);

				if (cancelled) return;

				// Only suggest if detected as question/option with high confidence
				if (result.detectedType !== 'statement' && result.confidence >= MIN_CONFIDENCE) {
					let suggestedType =
						result.detectedType === 'question' ? StatementType.question : StatementType.option;

					// If parent is a title question, flip detected questions to options
					if (parentStatement?.isTitleQuestion && suggestedType === StatementType.question) {
						suggestedType = StatementType.option;
					}

					setState({ suggestedType, isVisible: true });
				}
			} catch (error) {
				logError(error, {
					operation: 'hooks.useStatementTypeDetection',
					metadata: { statementId: statement.statementId },
				});
			}
		}, DETECTION_DELAY_MS);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// Only re-run when the statement identity changes
	}, [statement.statementId]);

	// Hide banner if type was changed externally (e.g., via menu)
	useEffect(() => {
		if (statement.statementType !== StatementType.statement && state.isVisible) {
			setState({ suggestedType: null, isVisible: false });
		}
	}, [statement.statementType, state.isVisible]);

	return { ...state, dismiss };
}

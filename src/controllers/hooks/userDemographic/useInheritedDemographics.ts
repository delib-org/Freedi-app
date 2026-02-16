import { useState, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { RootState } from '@/redux/store';
import { logError } from '@/utils/errorHandling';
import type { InheritedQuestion } from '@/view/components/atomic/molecules/InheritedDemographics';

// Use string literal for scope since it's exported as type-only
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;

/**
 * Hook for managing inherited demographic surveys from parent statements
 *
 * This hook:
 * 1. Fetches all demographic questions from parent statements in the hierarchy
 * 2. Tracks which inherited questions are enabled/disabled for the current statement
 * 3. Provides methods to toggle inherited questions
 */

interface UseInheritedDemographicsResult {
	/** List of inherited questions with their enabled status */
	inheritedQuestions: InheritedQuestion[];

	/** Loading state */
	loading: boolean;

	/** Error message if any */
	error: string | null;

	/** Toggle a specific inherited question on/off */
	toggleQuestion: (questionId: string, enabled: boolean) => void;

	/** Enable all inherited questions */
	enableAll: () => void;

	/** Disable all inherited questions */
	disableAll: () => void;

	/** List of excluded question IDs */
	excludedQuestionIds: string[];

	/** Number of enabled inherited questions */
	enabledCount: number;

	/** Total number of inherited questions */
	totalCount: number;
}

interface UseInheritedDemographicsOptions {
	/** The current statement */
	statement: Statement;

	/** Initial list of excluded question IDs (from database) */
	initialExcludedIds?: string[];

	/** Callback when excluded IDs change (for persisting to database) */
	onExcludedIdsChange?: (excludedIds: string[]) => void;
}

export function useInheritedDemographics({
	statement,
	initialExcludedIds = [],
	onExcludedIdsChange,
}: UseInheritedDemographicsOptions): UseInheritedDemographicsResult {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [excludedQuestionIds, setExcludedQuestionIds] = useState<string[]>(initialExcludedIds);

	// Get all statements from the store for building the parent chain
	const allStatements = useSelector((state: RootState) => state.statements.statements);

	// Get user demographic questions from the store
	const allDemographicQuestions = useSelector(
		(state: RootState) => state.userDemographic.userDemographicQuestions,
	);

	// Build the parent chain for this statement
	const parentChain = useMemo(() => {
		const chain: Statement[] = [];
		let currentParentId = statement.parentId;

		// Walk up the hierarchy
		while (currentParentId && currentParentId !== 'top') {
			const parent = allStatements.find((s) => s.statementId === currentParentId);
			if (parent) {
				chain.push(parent);
				currentParentId = parent.parentId;
			} else {
				break;
			}
		}

		return chain;
	}, [statement.parentId, allStatements]);

	// Get all inherited demographic questions from parent statements
	const inheritedQuestions = useMemo(() => {
		const inherited: InheritedQuestion[] = [];

		try {
			// For each parent in the chain, find demographic questions that apply to this statement
			parentChain.forEach((parentStatement) => {
				// Get questions defined on this parent
				const parentQuestions = allDemographicQuestions.filter(
					(q) =>
						q.statementId === parentStatement.statementId && q.scope === DEMOGRAPHIC_SCOPE_GROUP, // Only include group-scoped questions
				);

				// Transform to InheritedQuestion format
				parentQuestions.forEach((question) => {
					if (question.userQuestionId) {
						inherited.push({
							...question,
							sourceStatementId: parentStatement.statementId,
							sourceStatementTitle:
								parentStatement.statement.substring(0, 50) +
								(parentStatement.statement.length > 50 ? '...' : ''),
							sourceType: parentStatement.parentId === 'top' ? 'group' : 'discussion',
							isEnabled: !excludedQuestionIds.includes(question.userQuestionId),
						});
					}
				});
			});

			// Also check for questions at the topParent level if different from immediate parents
			if (statement.topParentId) {
				const topParentQuestions = allDemographicQuestions.filter(
					(q) =>
						q.topParentId === statement.topParentId &&
						q.scope === DEMOGRAPHIC_SCOPE_GROUP &&
						!parentChain.some((p) => p.statementId === q.statementId), // Avoid duplicates
				);

				const topParent = allStatements.find((s) => s.statementId === statement.topParentId);

				if (topParent) {
					topParentQuestions.forEach((question) => {
						if (
							question.userQuestionId &&
							!inherited.some((i) => i.userQuestionId === question.userQuestionId)
						) {
							inherited.push({
								...question,
								sourceStatementId: topParent.statementId,
								sourceStatementTitle:
									topParent.statement.substring(0, 50) +
									(topParent.statement.length > 50 ? '...' : ''),
								sourceType: 'group',
								isEnabled: !excludedQuestionIds.includes(question.userQuestionId),
							});
						}
					});
				}
			}
		} catch (err) {
			logError(err, {
				operation: 'useInheritedDemographics.buildInheritedQuestions',
				statementId: statement.statementId,
			});
			setError('Failed to load inherited demographics');
		}

		setLoading(false);

		return inherited;
	}, [
		parentChain,
		allDemographicQuestions,
		excludedQuestionIds,
		statement.statementId,
		statement.topParentId,
		allStatements,
	]);

	// Toggle a specific question
	const toggleQuestion = useCallback(
		(questionId: string, enabled: boolean) => {
			setExcludedQuestionIds((prev) => {
				const newExcluded = enabled
					? prev.filter((id) => id !== questionId)
					: [...prev, questionId];

				// Notify parent component of change
				if (onExcludedIdsChange) {
					onExcludedIdsChange(newExcluded);
				}

				return newExcluded;
			});
		},
		[onExcludedIdsChange],
	);

	// Enable all inherited questions
	const enableAll = useCallback(() => {
		setExcludedQuestionIds([]);
		if (onExcludedIdsChange) {
			onExcludedIdsChange([]);
		}
	}, [onExcludedIdsChange]);

	// Disable all inherited questions
	const disableAll = useCallback(() => {
		const allIds = inheritedQuestions
			.map((q) => q.userQuestionId)
			.filter((id): id is string => !!id);
		setExcludedQuestionIds(allIds);
		if (onExcludedIdsChange) {
			onExcludedIdsChange(allIds);
		}
	}, [inheritedQuestions, onExcludedIdsChange]);

	// Calculate counts
	const enabledCount = inheritedQuestions.filter((q) => q.isEnabled).length;
	const totalCount = inheritedQuestions.length;

	return {
		inheritedQuestions,
		loading,
		error,
		toggleQuestion,
		enableAll,
		disableAll,
		excludedQuestionIds,
		enabledCount,
		totalCount,
	};
}

export default useInheritedDemographics;

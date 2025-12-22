import {
	EnhancedEvaluationThumb,
	enhancedEvaluationsThumbs,
} from './components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';
import { updateStatementTop } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { Statement, SortType } from '@freedi/shared-types';

export function sortSubStatements(
	subStatements: Statement[],
	sort: string | undefined,
	gap = 30,
	randomSeed?: number,
	parentStatement?: Statement
): { totalHeight: number } {
	try {
		const dispatch = store.dispatch;
		let _subStatements = [...subStatements];

		// Special case: preserve backend order for mass consensus random suggestions
		if (sort === 'backend-order') {
			// Keep the original order from backend
			_subStatements = subStatements;
		} else {
			switch (sort) {
				case SortType.accepted: {
					// Check if parent has single-like evaluation type
					const isSingleLike = parentStatement?.statementSettings?.evaluationType === 'single-like';

					if (isSingleLike) {
						// Sort by likes (pro) for single-like evaluation
						_subStatements = subStatements.sort(
							(a: Statement, b: Statement) => {
								const aLikes = a.evaluation?.sumPro || a.pro || 0;
								const bLikes = b.evaluation?.sumPro || b.pro || 0;

								return bLikes - aLikes;
							}
						);
					} else {
						// Default: sort by agreement (evaluation.agreement preferred, fallback to consensus)
						_subStatements = subStatements.sort(
							(a: Statement, b: Statement) =>
								(b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0)
						);
					}
					break;
				}
				case SortType.newest:
					_subStatements = subStatements.sort(
						(a: Statement, b: Statement) => b.createdAt - a.createdAt
					);
					break;

				case SortType.random:
					// Use a seeded random for consistent sorting within a session
					if (randomSeed) {
						// Create a hash that combines the seed with statement IDs
						// This ensures different orders for different seeds
						_subStatements = subStatements.sort((a, b) => {
							// Combine seed with statement ID and create a pseudo-random hash
							const hashA = `${randomSeed}-${a.statementId}`.split('').reduce(
								(acc, char, index) => acc + char.charCodeAt(0) * (index + 1) * randomSeed % 10000,
								0
							);
							const hashB = `${randomSeed}-${b.statementId}`.split('').reduce(
								(acc, char, index) => acc + char.charCodeAt(0) * (index + 1) * randomSeed % 10000,
								0
							);

							return hashA - hashB;
						});
					} else {
						_subStatements = subStatements.sort(() => Math.random() - 0.5);
					}
					break;
				case SortType.mostUpdated:
					_subStatements = subStatements.sort(
						(a: Statement, b: Statement) => b.lastUpdate - a.lastUpdate
					);
					break;
			}
		}

		// Check if all heights have been measured
		const allMeasured = _subStatements.every(s => s.elementHight && s.elementHight > 0);

		let totalHeight = gap;
		const updates: { statementId: string; top: number }[] = _subStatements
			.map((subStatement, index) => {
				try {
					const update = {
						statementId: subStatement.statementId,
						top: totalHeight,
					};

					if (allMeasured) {
						// All heights measured - calculate real positions
						totalHeight += subStatement.elementHight + gap;
					} else {
						// Not all measured yet - stack with minimal offset to allow measurement
						// Use small offset to prevent complete overlap during measurement
						totalHeight = gap + (index * 5);
					}

					return update;
				} catch (error) {
					console.error(error);
				}
			})
			.filter((update) => update !== undefined) as {
				statementId: string;
				top: number;
			}[];

		// Only dispatch if the top values have actually changed
		const currentState = store.getState();
		const hasChanges = updates.some((update) => {
			const statement = currentState.statements.statements.find(
				(s) => s.statementId === update.statementId
			);

			return !statement || statement.top !== update.top;
		});

		if (hasChanges) {
			dispatch(updateStatementTop(updates));
		}

		return { totalHeight };
	} catch (error) {
		console.error(error);

		return { totalHeight: 0 };
	}
}

const defaultThumb = enhancedEvaluationsThumbs[2];

export const getEvaluationThumbIdByScore = (
	evaluationScore: number | undefined
): string => {
	if (evaluationScore === undefined) return defaultThumb.id;

	// find the nearest evaluation
	let nearestThumb = enhancedEvaluationsThumbs[0];

	enhancedEvaluationsThumbs.forEach((evaluationThumb) => {
		const current = Math.abs(evaluationScore - evaluationThumb.evaluation);
		const nearest = Math.abs(evaluationScore - nearestThumb.evaluation);

		if (current < nearest) {
			nearestThumb = evaluationThumb;
		}
	});

	return nearestThumb.id;
};

interface GetEvaluationThumbsParams {
	evaluationScore: number | undefined;
	isEvaluationPanelOpen: boolean;
}

export const getEvaluationThumbsToDisplay = ({
	evaluationScore,
	isEvaluationPanelOpen,
}: GetEvaluationThumbsParams): EnhancedEvaluationThumb[] => {
	if (isEvaluationPanelOpen) {
		return enhancedEvaluationsThumbs;
	}

	if (evaluationScore === undefined) {
		const firstAndLastThumbs = [
			enhancedEvaluationsThumbs[0],
			enhancedEvaluationsThumbs[enhancedEvaluationsThumbs.length - 1],
		];

		return firstAndLastThumbs;
	}

	const selectedThumbId = getEvaluationThumbIdByScore(evaluationScore);
	const selectedThumb = enhancedEvaluationsThumbs.find(
		(evaluationThumb) => evaluationThumb.id === selectedThumbId
	);

	return [selectedThumb || defaultThumb];
};

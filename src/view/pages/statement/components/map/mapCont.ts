import { getResultsDB } from '@/controllers/db/results/getResults';
import { ResultsBy, Results, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

export async function getResults(
	statement: Statement,
	subStatements: Statement[],
	resultsBy: ResultsBy,
	numberOfResults: number,
): Promise<Results> {
	try {
		const result: Results = { top: statement, sub: [] };

		if (resultsBy === ResultsBy.consensus) {
			result.sub = [...getResultsByOptions(subStatements, numberOfResults)];
		} else {
			result.sub = [];
		}

		const subResultsPromises = result.sub.map(async (subResult: Results) => {
			const subStatement = subResult.top;
			const subResults: Statement[] = await getResultsDB(subStatement);

			return subResults;
		});

		const resultsStatements = await Promise.all(subResultsPromises);

		result.sub.forEach((_: Results, index: number) => {
			if (!result.sub) return;
			result.sub[index].sub = [
				...resultsStatements[index].map((subStatement: Statement) => ({
					top: subStatement,
					sub: [],
				})),
			];
		});

		return result;
	} catch (error) {
		logError(error, {
			operation: 'mapCont.getResults',
			statementId: statement?.statementId,
			metadata: {
				resultsBy,
				numberOfResults,
			},
		});

		return { top: statement, sub: [] };
	}
}
export function getResultsByOptions(
	subStatements: Statement[],
	numberOfResults: number,
): Results[] {
	try {
		const maxOptions: Statement[] = subStatements.slice(0, numberOfResults || 1);

		const _maxOptions = maxOptions.map((topStatement: Statement) => ({
			top: topStatement,
			sub: [],
		}));

		return _maxOptions;
	} catch (error) {
		logError(error, {
			operation: 'mapCont.getResultsByOptions',
			metadata: {
				numberOfResults,
				subStatementsCount: subStatements?.length,
			},
		});

		return [];
	}
}

/**
 * Optimized O(n) algorithm for building tree structure
 * Previous implementation was O(n²) due to filtering entire array for each node
 */
export function resultsByParentId(parentStatement: Statement, subStatements: Statement[]): Results {
	try {
		if (!parentStatement) throw new Error('No parentStatement');
		if (!subStatements?.length) return { top: parentStatement, sub: [] };

		// Build parent-child map in single pass O(n)
		const childrenMap = new Map<string, Statement[]>();

		subStatements.forEach((statement) => {
			if (statement.parentId) {
				const siblings = childrenMap.get(statement.parentId) || [];
				siblings.push(statement);
				childrenMap.set(statement.parentId, siblings);
			}
		});

		// Build tree recursively using map (no filtering needed)
		function buildNode(statement: Statement): Results {
			const children = childrenMap.get(statement.statementId) || [];

			return {
				top: statement,
				sub: children.map((child) => buildNode(child)),
			};
		}

		return buildNode(parentStatement);
	} catch (error) {
		logError(error, {
			operation: 'mapCont.resultsByParentId',
			metadata: {
				parentStatementId: parentStatement?.statementId,
				subStatementsCount: subStatements?.length,
			},
		});

		// Return a minimal valid result instead of undefined
		return { top: parentStatement, sub: [] };
	}
}

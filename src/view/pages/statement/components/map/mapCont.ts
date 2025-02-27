import { getResultsDB } from '@/controllers/db/results/getResults';
import { DeliberativeElement } from '@/types/TypeEnums';
import { ResultsBy, Results } from '@/types/results/Results';
import { Statement } from '@/types/statement/StatementTypes';

export async function getResults(
	statement: Statement,
	subStatements: Statement[],
	resultsBy: ResultsBy,
	numberOfResults: number
): Promise<Results> {
	try {
		const result: Results = { top: statement, sub: [] };

		if (resultsBy === ResultsBy.topOptions) {
			result.sub = [
				...getResultsByOptions(subStatements, numberOfResults),
			];
		} else {
			result.sub = [];
		}

		const subResultsPromises = result.sub.map(
			async (subResult: Results) => {
				const subStatement = subResult.top;
				const subResults: Statement[] =
					await getResultsDB(subStatement);

				return subResults;
			}
		);

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
		console.error(error);

		return { top: statement, sub: [] };
	}
}
export function getResultsByOptions(
	subStatements: Statement[],
	numberOfResults: number
): Results[] {
	try {
		const maxOptions: Statement[] = subStatements
			.slice(0, numberOfResults || 1);

		const _maxOptions = maxOptions.map((topStatement: Statement) => ({
			top: topStatement,
			sub: [],
		}));

		return _maxOptions;
	} catch (error) {
		console.error(error);

		return [];
	}
}

export function resultsByParentId(parentStatement: Statement, subStatements: Statement[]): Results {
	try {
		if (!parentStatement) throw new Error('No parentStatement');
		if (!subStatements?.length) return { top: parentStatement, sub: [] };

		// Create the result object
		const result: Results = { top: parentStatement, sub: [] };

		// Filter statements that have this parent as their parent
		const directChildren = subStatements.filter(
			(subStatement) => subStatement.parentId === parentStatement.statementId
		);

		// For each direct child, recursively get its children
		result.sub = directChildren.map((childStatement) =>
			resultsByParentId(childStatement, subStatements)
		);

		return result;
	} catch (error) {
		console.error(error);
		// Return a minimal valid result instead of undefined
		return { top: parentStatement, sub: [] };
	}
}

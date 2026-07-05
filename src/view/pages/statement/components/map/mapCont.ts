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
 *
 * Cluster nesting: clusters (synths and topic clusters) are stored FLAT — they
 * and their members all share `parentId = question`; membership lives in the
 * cluster's `integratedOptions[]`, not in `parentId`. To represent that in the
 * map we lift each cluster's members out of their flat position and nest them
 * under the cluster. Because a member can itself be a cluster (a topic cluster
 * whose members are synths), this nests recursively to produce
 * cluster → synth → statement (or any shorter chain).
 */
export function resultsByParentId(parentStatement: Statement, subStatements: Statement[]): Results {
	try {
		if (!parentStatement) throw new Error('No parentStatement');
		if (!subStatements?.length) return { top: parentStatement, sub: [] };

		// Index every statement by id for cluster-membership lookups.
		const byId = new Map<string, Statement>();
		byId.set(parentStatement.statementId, parentStatement);
		subStatements.forEach((statement) => byId.set(statement.statementId, statement));

		// Build parent-child map in single pass O(n)
		const childrenMap = new Map<string, Statement[]>();

		subStatements.forEach((statement) => {
			if (statement.parentId) {
				const siblings = childrenMap.get(statement.parentId) || [];
				siblings.push(statement);
				childrenMap.set(statement.parentId, siblings);
			}
		});

		// Members that belong to a loaded cluster: nest them under the cluster
		// instead of leaving them as flat siblings of the question.
		const absorbedIds = new Set<string>();
		subStatements.forEach((statement) => {
			if (statement.isCluster && Array.isArray(statement.integratedOptions)) {
				statement.integratedOptions.forEach((memberId) => {
					if (byId.has(memberId)) absorbedIds.add(memberId);
				});
			}
		});

		// Guard against cycles / a member listed by more than one cluster.
		const visited = new Set<string>();

		function buildNode(statement: Statement): Results {
			visited.add(statement.statementId);

			// Direct children by parentId, excluding any absorbed into a cluster.
			const sub: Results[] = (childrenMap.get(statement.statementId) || [])
				.filter((child) => !absorbedIds.has(child.statementId))
				.map((child) => buildNode(child));

			// Nest this cluster's members (which may themselves be clusters).
			if (statement.isCluster && Array.isArray(statement.integratedOptions)) {
				statement.integratedOptions.forEach((memberId) => {
					const member = byId.get(memberId);
					if (!member || visited.has(memberId)) return;
					sub.push(buildNode(member));
				});
			}

			return { top: statement, sub };
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

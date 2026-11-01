import { Evaluation, Statement, StatementEvaluation } from '@freedi/shared-types';
import type { PopperHebbianScore } from '@freedi/shared-types';
import { calculateConsensusValid } from '../helpers/consensusValidCalculator';
import { recomputeOptionCounters } from './recomputeOptionCounters';
import { ClusterNode, collectTreeIds, computeEffectiveTreeVote } from '../condensation/clusterTree';

export interface StatementFix {
	statementId: string;
	statementText?: string; // First 50 chars of statement text for identification
	isClusterOption?: boolean;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
}

/**
 * Cluster-option recompute using pre-grouped evaluations and the cluster's
 * member tree. Same per-user rule as `recomputeClusterEvaluation`: the direct
 * vote wins, then absorbed clusters, else the average over members, resolved
 * recursively through nested clusters (see `clusterTree.ts`).
 */
export function planClusterRecompute(
	statement: Statement & { integratedOptions?: string[]; isCluster?: boolean },
	clusterId: string,
	tree: ClusterNode,
	evalsByStatementId: Map<string, Evaluation[]>,
	populationSize: number | undefined,
): { payload: Record<string, unknown>; fix: StatementFix } | null {
	if ((statement.integratedOptions ?? []).length === 0) return null;

	// One effective vote per distinct voter, by the nested rule shared with
	// recomputeClusterEvaluation (clusterTree.ts). A direct evaluation flagged
	// `migratedAt` on the cluster itself is stale and is ignored (legacy rule).
	const userEvals = new Map<string, Map<string, Evaluation>>();
	const treeIds = collectTreeIds(tree);
	for (const id of treeIds) {
		for (const e of evalsByStatementId.get(id) ?? []) {
			if (id === clusterId && (e as Evaluation & { migratedAt?: number }).migratedAt) continue;
			const uid = e.evaluator?.uid ?? e.evaluatorId;
			if (!uid) continue;
			const mine = userEvals.get(uid);
			if (mine) mine.set(id, e);
			else userEvals.set(uid, new Map([[id, e]]));
		}
	}
	const effectiveVotes: { evaluation: number }[] = [];
	for (const mine of userEvals.values()) {
		const effective = computeEffectiveTreeVote(tree, mine);
		if (effective !== null) effectiveVotes.push({ evaluation: effective });
	}

	// One entry per distinct voter (zeros included), same rule as plain options.
	const counters = recomputeOptionCounters(effectiveVotes, populationSize);
	const { agreement, numberOfEvaluators: totalEvaluators } = counters;

	const currentEval: StatementEvaluation = statement.evaluation || {
		numberOfEvaluators: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumEvaluations: 0,
		sumPro: 0,
		sumCon: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		agreement: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};
	const before = {
		numberOfEvaluators: currentEval.numberOfEvaluators || 0,
		numberOfProEvaluators: currentEval.numberOfProEvaluators || 0,
		numberOfConEvaluators: currentEval.numberOfConEvaluators || 0,
	};

	const consensusValid = calculateConsensusValid(
		agreement,
		(statement as Statement & { popperHebbianScore?: PopperHebbianScore }).popperHebbianScore ??
			undefined,
	);

	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: counters.numberOfEvaluators,
		numberOfProEvaluators: counters.numberOfProEvaluators,
		numberOfConEvaluators: counters.numberOfConEvaluators,
		sumEvaluations: counters.sumEvaluations,
		sumSquaredEvaluations: counters.sumSquaredEvaluations,
		sumPro: counters.sumPro,
		sumCon: counters.sumCon,
		averageEvaluation: counters.averageEvaluation,
		agreement,
		agreementIndex: counters.agreementIndex,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};
	if (counters.stakeholderCount !== undefined) {
		updatedEvaluation.stakeholderCount = counters.stakeholderCount;
	} else {
		delete updatedEvaluation.stakeholderCount;
	}

	return {
		payload: {
			evaluation: updatedEvaluation,
			totalEvaluators,
			consensus: agreement,
			consensusValid,
			proSum: counters.sumPro,
			conSum: counters.sumCon,
		},
		fix: {
			statementId: clusterId,
			statementText: statement.statement?.substring(0, 50),
			isClusterOption: true,
			before: { ...before, consensus: statement.consensus ?? 0 },
			after: {
				numberOfEvaluators: totalEvaluators,
				numberOfProEvaluators: counters.numberOfProEvaluators,
				numberOfConEvaluators: counters.numberOfConEvaluators,
				consensus: agreement,
			},
		},
	};
}

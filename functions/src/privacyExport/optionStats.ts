/**
 * Per-option statistics for the privacy-preserving export.
 *
 * Every option gets its DIRECT stats (evaluations whose statementId is the
 * option). A derived option (`isCluster`) also gets MERGED stats: one vote per
 * user across the option and its member options, computed by the same
 * aggregator that writes the cluster's score shown in the app, so the export
 * matches the screen.
 */

import {
	Evaluation,
	Statement,
	StatementType,
	calcAgreement,
	calcAgreementIndex,
} from '@freedi/shared-types';
import { computeClusterEvaluationFromRawEvals } from '../condensation/aggregation';
import { buildClusterTree, collectTreeIds } from '../condensation/clusterTree';
import { calculateEvaluationStats } from './kAnonymity';
import { DerivedPipeline, MergedOptionStats, OptionEvaluationSummary } from './types';

/** Explains `statsMethod` and the merged columns; emitted as `statsNotes`. */
export const STATS_NOTES =
	'Direct stats (totalEvaluators, averageEvaluation, proCount, conCount, neutralCount, sumEvaluations, agreement, agreementIndex) ' +
	'count the evaluations whose statementId is this option. ' +
	"Options with statsMethod 'direct+merged' are derived (a synthesis or a theme) and also carry merged* fields: " +
	"one vote per user across the option and its member options, as shown in the app — the user's direct vote on the " +
	'derived option wins, otherwise the average of their votes on its members; members that are themselves derived ' +
	'(a synthesis inside a theme) are resolved the same way, level by level. ' +
	"Themes are not voted on directly: a theme's numbers are roll-ups of its members and its agreement is indicative only. " +
	'When metadata.fpcApplied is true, agreement uses the finite-population correction with N = metadata.stakeholderCount.';

/**
 * Back-compat provenance markers written by the synthesis pipeline via an
 * untyped cast, so they are absent from the Statement schema.
 */
interface LegacyDerivedFields {
	isSynthesis?: boolean;
	liveSynthOrigin?: string;
}

/**
 * Pipeline-derived statement detection. Mirrors `isDerivedStatement` in
 * `src/utils/derivedStatement.ts` so participation counts label the same set.
 */
export function isDerivedStatement(statement: Statement): boolean {
	const legacy = statement as Statement & LegacyDerivedFields;

	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		!!legacy.liveSynthOrigin ||
		statement.statementType === StatementType.synthesis
	);
}

/** Mirrors `resolveDerivedPipeline` in `src/utils/derivedStatement.ts`. */
function resolveDerivedPipeline(statement: Statement): DerivedPipeline {
	if (statement.derivedByPipeline) return statement.derivedByPipeline as DerivedPipeline;
	if (statement.statementType === StatementType.synthesis) return 'synthesis';

	const legacy = statement as Statement & LegacyDerivedFields;
	if (typeof legacy.isSynthesis === 'boolean') {
		return legacy.isSynthesis ? 'synthesis' : 'topic-cluster';
	}

	return 'unknown-cluster';
}

/** Evaluations grouped by the statement they were cast on. */
export function groupEvaluationsByStatement(evaluations: Evaluation[]): Map<string, Evaluation[]> {
	const byStatement = new Map<string, Evaluation[]>();
	for (const evaluation of evaluations) {
		const list = byStatement.get(evaluation.statementId);
		if (list) list.push(evaluation);
		else byStatement.set(evaluation.statementId, [evaluation]);
	}

	return byStatement;
}

/** Options keyed by statement id: the lookup the member trees are built from. */
export function indexOptions(options: Statement[]): Map<string, Statement> {
	return new Map(options.map((option) => [option.statementId, option]));
}

/** The cluster's member tree, expanded through the question's own options. */
function treeFor(option: Statement, optionsById: ReadonlyMap<string, Statement>) {
	return buildClusterTree(option.statementId, (id) =>
		id === option.statementId ? option : optionsById.get(id),
	);
}

/**
 * Statement ids whose evaluations feed some cluster's merged stats, including
 * the members of nested clusters (a synthesis inside a theme) found among the
 * question's options.
 */
export function mergedSourceIds(options: Statement[]): Set<string> {
	const optionsById = indexOptions(options);
	const ids = new Set<string>();
	for (const option of options) {
		if (option.isCluster !== true) continue;
		collectTreeIds(treeFor(option, optionsById)).forEach((id) => ids.add(id));
	}

	return ids;
}

/**
 * Merged stats for a cluster via the app's own aggregator. Agreement is
 * recomputed from the aggregator's sums with the question's N, so merged and
 * direct agreement use the same population; without N it equals the
 * aggregator's own value. `optionsById` lets nested members be expanded;
 * without it only the cluster's direct members are known.
 */
export function computeMergedStats(
	option: Statement,
	byStatement: Map<string, Evaluation[]>,
	stakeholderCount: number | undefined,
	optionsById: ReadonlyMap<string, Statement> = new Map(),
): MergedOptionStats {
	const clusterTree = treeFor(option, optionsById);
	const sourceEvals = collectTreeIds(clusterTree).flatMap((id) => byStatement.get(id) ?? []);
	const { evaluation } = computeClusterEvaluationFromRawEvals(sourceEvals, {
		clusterTree,
		targetPopulation: stakeholderCount,
	});
	const n = evaluation.numberOfEvaluators;
	const pro = evaluation.numberOfProEvaluators ?? 0;
	const con = evaluation.numberOfConEvaluators ?? 0;
	const sumSquared = evaluation.sumSquaredEvaluations ?? 0;

	return {
		mergedTotalEvaluators: n,
		mergedAverageEvaluation: evaluation.averageEvaluation ?? 0,
		mergedProCount: pro,
		mergedConCount: con,
		mergedNeutralCount: n - pro - con,
		mergedSumEvaluations: evaluation.sumEvaluations,
		mergedAgreement: calcAgreement(evaluation.sumEvaluations, sumSquared, n, stakeholderCount),
		mergedAgreementIndex: calcAgreementIndex(
			evaluation.sumEvaluations,
			sumSquared,
			n,
			stakeholderCount,
		),
	};
}

/** One option's summary: direct stats, and merged stats for a cluster. */
export function buildOptionSummary(
	option: Statement,
	byStatement: Map<string, Evaluation[]>,
	stakeholderCount: number | undefined,
	optionsById: ReadonlyMap<string, Statement> = new Map(),
): OptionEvaluationSummary {
	const direct = byStatement.get(option.statementId) ?? [];
	const stats = calculateEvaluationStats(direct.map((e) => e.evaluation));
	const derived = isDerivedStatement(option);
	const isCluster = option.isCluster === true;
	const n = stats.evaluatorCount;

	return {
		statementId: option.statementId,
		statementText: option.statement,
		totalEvaluators: n,
		averageEvaluation: stats.averageEvaluation,
		proCount: stats.proCount,
		conCount: stats.conCount,
		neutralCount: stats.neutralCount,
		sumEvaluations: stats.sumEvaluations,
		agreement: calcAgreement(
			stats.sumEvaluations,
			stats.sumSquaredEvaluations,
			n,
			stakeholderCount,
		),
		agreementIndex: calcAgreementIndex(
			stats.sumEvaluations,
			stats.sumSquaredEvaluations,
			n,
			stakeholderCount,
		),
		hide: option.hide === true,
		isDerived: derived,
		isCluster: option.isCluster,
		derivedByPipeline: derived ? resolveDerivedPipeline(option) : undefined,
		integratedOptions: derived ? option.integratedOptions : undefined,
		statsMethod: isCluster ? 'direct+merged' : 'direct',
		...(isCluster ? computeMergedStats(option, byStatement, stakeholderCount, optionsById) : {}),
	};
}

export function buildOptionSummaries(
	options: Statement[],
	evaluations: Evaluation[],
	stakeholderCount: number | undefined,
): OptionEvaluationSummary[] {
	const byStatement = groupEvaluationsByStatement(evaluations);
	const optionsById = indexOptions(options);

	return options.map((option) =>
		buildOptionSummary(option, byStatement, stakeholderCount, optionsById),
	);
}

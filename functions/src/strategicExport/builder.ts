/**
 * Strategic export — orchestrator. Pipes loader → clustering → aggregation
 * → topic grouping → demographic slicing → JSON.
 */

import { logger } from 'firebase-functions';
import type {
	Statement,
	StrategicExportResponse,
	AggregatedSuggestion,
	TopicGroup,
	AggregateMember,
	StrategicExportMetadata,
} from '@freedi/shared-types';
import { runTopicClusterPipeline } from '../services/topic-cluster';
import {
	loadDemographicAnswers,
	loadDemographicQuestions,
	loadDirectChildren,
	loadQuestion,
	loadTopicClusterFraming,
} from './loader';
import { aggregateEvaluationsForMembers } from './aggregator';
import { buildDemographicBreakdown, buildDemographicQuestionSummaries } from './demographicSlicer';
import { groupAggregatesIntoTopics } from './topicGrouper';
import { STRATEGIC_EXPORT_SCHEMA } from './schemaDoc';

interface BuildOptions {
	questionStatementId: string;
	consensusThreshold: number;
	kAnonymity: number;
	forceClustering: boolean;
}

/**
 * Inclusion rule: keep an option if its individual consensus is high enough,
 * OR if it has at least 3 evaluators and an average above 0.6 (rescues
 * lightly-evaluated but very positive suggestions whose C_p was suppressed
 * by the small-sample penalty).
 */
const RESCUE_MIN_EVALUATORS = 3;
const RESCUE_MIN_AVG = 0.6;

function passesInclusionFilter(statement: Statement, consensusThreshold: number): boolean {
	const consensus = statement.consensus ?? statement.evaluation?.agreement ?? 0;
	if (consensus >= consensusThreshold) return true;
	const totalEvaluators =
		statement.evaluation?.numberOfEvaluators ?? statement.totalEvaluators ?? 0;
	const avg = statement.evaluation?.averageEvaluation ?? 0;

	return totalEvaluators >= RESCUE_MIN_EVALUATORS && avg > RESCUE_MIN_AVG;
}

export async function buildStrategicExport(opts: BuildOptions): Promise<StrategicExportResponse> {
	const { questionStatementId, consensusThreshold, kAnonymity, forceClustering } = opts;

	// 1. Load + validate the question.
	const question = await loadQuestion(questionStatementId);

	// 2. Trigger topic-cluster pipeline if missing or forced.
	let framing = await loadTopicClusterFraming(questionStatementId);
	let clusteringTriggered = false;
	if (!framing || forceClustering) {
		logger.info('strategicExport: triggering topic-cluster pipeline', {
			questionStatementId,
			reason: forceClustering ? 'forceClustering=true' : 'no existing framing',
		});
		await runTopicClusterPipeline(questionStatementId, {
			rebuildCache: forceClustering,
			rebuildTaxonomy: forceClustering,
		});
		clusteringTriggered = true;
		framing = await loadTopicClusterFraming(questionStatementId);
	}

	// 3. Load all direct children (clusters + leftover options).
	const children = await loadDirectChildren(questionStatementId);
	const totalOptionsConsidered = children.filter(
		(s) => s.statementType === 'option' && s.isCluster !== true,
	).length;

	// 4. Build a list of "aggregate candidates":
	//    - Each cluster Statement (isCluster === true) is one aggregate, members from integratedOptions.
	//    - Any leftover option not assigned to any framingCluster is its own singleton aggregate.
	type Candidate = {
		aggregateId: string;
		representativeText: string;
		memberStatementIds: string[];
		members: Statement[];
	};

	const candidates: Candidate[] = [];
	const childById = new Map<string, Statement>();
	for (const c of children) childById.set(c.statementId, c);

	const framingId = framing?.framingId;
	const optionsCoveredByCluster = new Set<string>();

	for (const c of children) {
		if (c.isCluster !== true) continue;
		const memberIds = c.integratedOptions ?? [];
		const members: Statement[] = [];
		for (const id of memberIds) {
			const m = childById.get(id);
			if (m) members.push(m);
		}
		if (memberIds.length > 0) memberIds.forEach((id) => optionsCoveredByCluster.add(id));
		candidates.push({
			aggregateId: c.statementId,
			representativeText: c.statement,
			memberStatementIds: memberIds.length > 0 ? memberIds : [c.statementId],
			members,
		});
	}

	// Leftover options not assigned to any cluster (singletons).
	for (const c of children) {
		if (c.isCluster === true) continue;
		if (c.statementType !== 'option') continue;
		if (optionsCoveredByCluster.has(c.statementId)) continue;
		const inFraming = framingId ? Boolean(c.framingClusters?.[framingId]) : false;
		// If the option IS assigned via framingClusters but not in any cluster's
		// integratedOptions (rare race), still treat it as a singleton candidate
		// so we don't drop it.
		void inFraming;
		candidates.push({
			aggregateId: c.statementId,
			representativeText: c.statement,
			memberStatementIds: [c.statementId],
			members: [c],
		});
	}

	// 5. Apply inclusion filter on members. An aggregate is included if at
	//    least one of its members passes the filter, OR if the aggregate
	//    itself (when it's a cluster) passes the filter.
	const filteredCandidates: Candidate[] = [];
	for (const cand of candidates) {
		const clusterStatement = childById.get(cand.aggregateId);
		const aggregatePasses = clusterStatement
			? passesInclusionFilter(clusterStatement, consensusThreshold)
			: false;
		const anyMemberPasses = cand.members.some((m) => passesInclusionFilter(m, consensusThreshold));
		if (aggregatePasses || anyMemberPasses) {
			filteredCandidates.push(cand);
		}
	}

	const optionsAfterFilter = filteredCandidates.reduce(
		(n, c) => n + c.memberStatementIds.length,
		0,
	);

	// 6. For each filtered aggregate, pool evaluations and recompute consensus.
	const aggregatedSuggestions: Array<{
		aggregate: AggregatedSuggestion;
		evaluatorIds: string[];
		userAverages: Map<string, number>;
	}> = [];
	const allEvaluatorIds = new Set<string>();

	for (const cand of filteredCandidates) {
		const result = await aggregateEvaluationsForMembers(cand.memberStatementIds);
		if (!result) continue;
		// Re-apply inclusion filter on the POOLED aggregate (can change after dedup).
		const passes =
			result.aggregate.C_p >= consensusThreshold ||
			(result.aggregate.totalEvaluators >= RESCUE_MIN_EVALUATORS &&
				result.aggregate.avg > RESCUE_MIN_AVG);
		if (!passes) continue;

		result.evaluatorIds.forEach((id) => allEvaluatorIds.add(id));

		const memberStatements: AggregateMember[] = cand.members.map((m) => ({
			statementId: m.statementId,
			text: m.statement,
		}));
		// If we had no members loaded (e.g. integratedOptions had a stale id),
		// fall back to the aggregate's own representative text as a member.
		if (memberStatements.length === 0) {
			memberStatements.push({
				statementId: cand.aggregateId,
				text: cand.representativeText,
			});
		}

		aggregatedSuggestions.push({
			aggregate: {
				aggregateId: cand.aggregateId,
				representativeText: cand.representativeText,
				memberStatements,
				evaluation: result.aggregate,
				demographicBreakdown: [], // filled in later when we have demographic answers
			},
			evaluatorIds: result.evaluatorIds,
			userAverages: result.userAverages,
		});
	}

	// 7. Load demographic questions + answers (only for the evaluators we ended up keeping).
	const demographicQuestions = await loadDemographicQuestions(question);
	const userAnswers =
		demographicQuestions.length > 0 && allEvaluatorIds.size > 0
			? await loadDemographicAnswers(Array.from(allEvaluatorIds), demographicQuestions)
			: new Map<string, Map<string, string>>();

	// 8. For each aggregate, build demographic breakdown.
	if (demographicQuestions.length > 0) {
		for (const a of aggregatedSuggestions) {
			a.aggregate.demographicBreakdown = buildDemographicBreakdown(
				a.userAverages,
				userAnswers,
				demographicQuestions,
				kAnonymity,
			);
		}
	}

	// 9. Topic grouping via LLM.
	const topicGroupings = await groupAggregatesIntoTopics(
		question.statement,
		aggregatedSuggestions.map((a) => ({
			aggregateId: a.aggregate.aggregateId,
			name: a.aggregate.representativeText,
		})),
	);

	const aggregateById = new Map(
		aggregatedSuggestions.map((a) => [a.aggregate.aggregateId, a.aggregate]),
	);
	const topics: TopicGroup[] = topicGroupings.map((t) => ({
		topicId: t.topicId,
		topicName: t.topicName,
		topicSummary: t.topicSummary,
		aggregatedSuggestions: t.aggregateIds
			.map((id) => aggregateById.get(id))
			.filter((x): x is AggregatedSuggestion => Boolean(x)),
	}));

	// 10. Demographic question summaries.
	const demographicSummary =
		demographicQuestions.length > 0
			? {
					questions: buildDemographicQuestionSummaries(
						allEvaluatorIds,
						userAnswers,
						demographicQuestions,
						kAnonymity,
					),
				}
			: { questions: [] };

	const metadata: StrategicExportMetadata = {
		questionId: question.statementId,
		questionText: question.statement,
		exportedAt: Date.now(),
		consensusThreshold,
		kAnonymity,
		totalOptionsConsidered,
		optionsAfterFilter,
		aggregatesAfterClustering: aggregatedSuggestions.length,
		clusteringTriggered,
	};

	return {
		_schema: STRATEGIC_EXPORT_SCHEMA,
		metadata,
		topics,
		demographicSummary,
	};
}

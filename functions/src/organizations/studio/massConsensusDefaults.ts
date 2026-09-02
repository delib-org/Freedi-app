import {
	CutoffBy,
	EvaluationUI,
	QuestionType,
	ResultsBy,
	Statement,
	evaluationType,
} from '@freedi/shared-types';

/**
 * Settings the Mass Consensus app expects on a survey question. Mirrors the
 * enrichment in `apps/mass-consensus/app/api/questions/create/route.ts`
 * (the path MC's own admin UI takes) so a question built from a Studio plan
 * behaves exactly like one created inside MC.
 */
export function applyMassConsensusQuestionDefaults(
	statement: Statement,
	opts: { askUserForASolutionBeforeEvaluation: boolean },
): Statement {
	return {
		...statement,
		questionSettings: {
			...statement.questionSettings,
			questionType: QuestionType.massConsensus,
			askUserForASolutionBeforeEvaluation: opts.askUserForASolutionBeforeEvaluation,
		},
		statementSettings: {
			...statement.statementSettings,
			showEvaluation: true,
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
			hasChat: true,
			hasChildren: false,
			evaluationType: evaluationType.range,
			enhancedEvaluation: true,
		},
		evaluationSettings: {
			...statement.evaluationSettings,
			evaluationUI: EvaluationUI.suggestions,
		},
		evaluation: {
			numberOfEvaluators: 0,
			sumEvaluations: 0,
			agreement: 0,
			averageEvaluation: 0,
			evaluationRandomNumber: Math.random(),
			viewed: 0,
		},
		results: [],
		resultsSettings: {
			resultsBy: ResultsBy.consensus,
			numberOfResults: 1,
			cutoffBy: CutoffBy.topOptions,
		},
	};
}

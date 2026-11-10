import { EvaluationUI, QuestionStep, Statement } from '@freedi/shared-types';
import { QuestionStageIndex, STAGE_DECIDED, STAGE_TO_STEP, STAGE_VOTING } from './questionStage';

/**
 * What a host's stage pick lets participants do. The host can still flip each
 * switch afterwards; a question nobody picked a stage on is left as it is.
 */

export interface StagePreset {
	addAnswers: boolean;
	rate: boolean;
	liveResults: boolean;
}

const STAGE_PRESETS: Readonly<Record<QuestionStageIndex, StagePreset>> = {
	0: { addAnswers: true, rate: true, liveResults: false },
	1: { addAnswers: true, rate: true, liveResults: false },
	2: { addAnswers: false, rate: true, liveResults: false },
	3: { addAnswers: false, rate: false, liveResults: true },
};

export function stagePreset(stage: QuestionStageIndex): StagePreset {
	return STAGE_PRESETS[stage];
}

/** The rating UI a stage asks for, or undefined to leave the question's own. */
function stageEvaluationUI(
	stage: QuestionStageIndex,
	current: EvaluationUI | undefined,
): EvaluationUI | undefined {
	if (stage === STAGE_DECIDED) return undefined;
	if (stage === STAGE_VOTING) return EvaluationUI.voting;
	if (current === undefined || current === EvaluationUI.voting) return EvaluationUI.suggestions;

	return undefined;
}

/** Dot-path fields, so the rest of each settings map survives the write. */
export type StagePresetFields = {
	'questionSettings.currentStep': QuestionStep;
	'statementSettings.enableAddEvaluationOption': boolean;
	'statementSettings.enableAddVotingOption': boolean;
	'statementSettings.enableEvaluation': boolean;
	'statementSettings.showEvaluation': boolean;
	'evaluationSettings.evaluationUI'?: EvaluationUI;
};

/** The fields one `updateDoc` writes to move this question to a stage. */
export function applyStagePreset(
	statement: Statement,
	stage: QuestionStageIndex,
): StagePresetFields {
	const preset = stagePreset(stage);
	const evaluationUI = stageEvaluationUI(stage, statement.evaluationSettings?.evaluationUI);

	return {
		'questionSettings.currentStep': STAGE_TO_STEP[stage],
		'statementSettings.enableAddEvaluationOption': preset.addAnswers,
		'statementSettings.enableAddVotingOption': preset.addAnswers,
		'statementSettings.enableEvaluation': preset.rate,
		'statementSettings.showEvaluation': preset.liveResults,
		...(evaluationUI ? { 'evaluationSettings.evaluationUI': evaluationUI } : {}),
	};
}

/**
 * True when any of the three host switches is not what this stage sets. The
 * add switch reads the flag for the UI in use, falling back to the rating flag
 * so a UI with no add flag of its own does not read as different forever.
 */
export function differsFromStagePreset(statement: Statement, stage: QuestionStageIndex): boolean {
	const preset = stagePreset(stage);
	const settings = statement.statementSettings;
	const addAnswers =
		statement.evaluationSettings?.evaluationUI === EvaluationUI.voting
			? settings?.enableAddVotingOption
			: settings?.enableAddEvaluationOption;

	return (
		(addAnswers ?? false) !== preset.addAnswers ||
		(settings?.enableEvaluation ?? true) !== preset.rate ||
		(settings?.showEvaluation ?? false) !== preset.liveResults
	);
}

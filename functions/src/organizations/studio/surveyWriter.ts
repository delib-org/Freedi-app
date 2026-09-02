import type { DocumentReference, WriteBatch } from 'firebase-admin/firestore';
import {
	Collections,
	DEFAULT_SURVEY_SETTINGS,
	QuestionStatus,
	Statement,
	Survey,
	SurveyExplanationPage,
	SurveySchema,
	SurveyStatus,
	StudioPlanSurveyConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { db } from '../../db';

/**
 * Admin-SDK mirror of Mass Consensus' `createSurvey`
 * (apps/mass-consensus/src/lib/firebase/surveys/surveyCrud.ts). MC deploys
 * separately (Vercel), so a Studio plan that needs a full survey writes the
 * `surveys` document here with the same shape and the same side effects:
 *   - `questionSettings.massConsensusSurveyId` stamped on every question
 *   - `statementSettings.liveSynthEnabled` / `synthesis.modelTier` cascaded
 *     (what `cascadeSynthesisToggle` resolves for a fresh survey)
 */

export function generateSurveyId(): string {
	return `survey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** MC's participant page only admits people while `status === 'active'`. */
export function surveyStatusForQuestionStatus(status: QuestionStatus | undefined): SurveyStatus {
	switch (status) {
		case 'frozen':
			return SurveyStatus.draft;
		case 'closed':
			return SurveyStatus.closed;
		case 'live':
		default:
			return SurveyStatus.active;
	}
}

export interface BuildSurveyInput {
	surveyId?: string;
	activity: Statement;
	extraQuestions: Statement[];
	config: StudioPlanSurveyConfig | undefined;
	parentStatementId: string;
	creatorId: string;
	language: string;
	status: SurveyStatus;
	now: number;
}

export function buildSurveyForActivity(input: BuildSurveyInput): Survey {
	const { activity, extraQuestions, config, parentStatementId, creatorId, language, status, now } =
		input;
	const explanationPages: SurveyExplanationPage[] = (config?.explanationPages ?? [])
		.filter((page) => page.title.trim() && page.content.trim())
		.map((page) => ({
			explanationPageId: getRandomUID(),
			title: page.title.trim(),
			content: page.content.trim(),
			position: 0,
		}));
	const intro = config?.intro?.trim();

	const survey: Survey = {
		surveyId: input.surveyId ?? generateSurveyId(),
		title: activity.statement,
		description: activity.description ?? '',
		creatorId,
		questionIds: [activity.statementId, ...extraQuestions.map((q) => q.statementId)],
		settings: {
			...DEFAULT_SURVEY_SETTINGS,
			...(config?.allowParticipantsToAddSuggestions !== undefined
				? { allowParticipantsToAddSuggestions: config.allowParticipantsToAddSuggestions }
				: {}),
			...(typeof config?.minEvaluationsPerQuestion === 'number' &&
			config.minEvaluationsPerQuestion > 0
				? { minEvaluationsPerQuestion: Math.round(config.minEvaluationsPerQuestion) }
				: {}),
		},
		questionSettings: {},
		status,
		defaultLanguage: language,
		parentStatementId,
		createdAt: now,
		lastUpdate: now,
	};
	if (explanationPages.length > 0) survey.explanationPages = explanationPages;
	if (intro) {
		survey.customIntroText = intro;
		survey.showIntro = true;
	}

	return parse(SurveySchema, survey);
}

/** Batch writes: the survey doc plus the per-question stamps/cascades. */
export function surveyWrites(
	survey: Survey,
	questionRefs: DocumentReference[],
	now: number,
): Array<(batch: WriteBatch) => void> {
	const writes: Array<(batch: WriteBatch) => void> = [];
	writes.push((batch) =>
		batch.set(db.collection(Collections.surveys).doc(survey.surveyId), survey),
	);
	questionRefs.forEach((ref) => {
		writes.push((batch) =>
			batch.update(ref, {
				'questionSettings.massConsensusSurveyId': survey.surveyId,
				'statementSettings.liveSynthEnabled': true,
				'statementSettings.synthesis.modelTier': 'standard',
				lastUpdate: now,
			}),
		);
	});

	return writes;
}

/** Keeps an MC survey's status in step with its question's run state. */
export async function syncSurveyStatus(
	surveyId: string,
	questionStatus: QuestionStatus | undefined,
	now: number,
): Promise<boolean> {
	const ref = db.collection(Collections.surveys).doc(surveyId);
	const snap = await ref.get();
	if (!snap.exists) return false;
	const next = surveyStatusForQuestionStatus(questionStatus);
	const current = (snap.data() as Partial<Survey> | undefined)?.status;
	if (current === next) return false;
	await ref.update({ status: next, lastUpdate: now });

	return true;
}

import {
	Collections,
	Statement,
	Survey,
	SurveyAdmin,
	canEditSurvey,
	getSurveyAdminId,
} from '@freedi/shared-types';
import { db } from '../db';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';

/** A survey's co-admins are invited by hand; past this many we refuse rather than read on. */
const MAX_SURVEY_ROSTER_READ = 50;

function isEditorRecordOf(admin: Partial<SurveyAdmin>, surveyId: string, uid: string): boolean {
	return (
		admin.surveyId === surveyId && admin.userId === uid && !!admin.role && canEditSurvey(admin.role)
	);
}

/**
 * True when someone who runs the survey (its owner or an editor) really administers
 * the question.
 *
 * `survey.questionIds` proves nothing alone. The MC API stores whatever ids a client
 * sends (POST and PUT /api/surveys), so any signed-in user can own a survey that lists
 * anyone's question. This is what ties the survey to the question: it holds the
 * question because one of the people running it had the right to put it there.
 */
async function isQuestionAdministeredByRoster(
	survey: Survey,
	question: Statement,
): Promise<boolean> {
	const rosterSnap = await db
		.collection(Collections.surveyAdmins)
		.where('surveyId', '==', survey.surveyId)
		.limit(MAX_SURVEY_ROSTER_READ)
		.get();
	const editors = rosterSnap.docs
		.map((doc) => doc.data() as Partial<SurveyAdmin>)
		.filter((admin) => isEditorRecordOf(admin, survey.surveyId, admin.userId ?? ''))
		.map((admin) => admin.userId as string);
	const sources = await Promise.all(
		[survey.creatorId, ...editors].map((uid) => findStatementAdminSource(uid, question)),
	);

	return sources.some((source) => source !== null);
}

/**
 * Whether `uid` may edit `question` because of the survey it sits in. All of:
 *   - the survey lists the question,
 *   - the caller owns the survey or is an editor co-admin of it (viewers are not),
 *   - the survey's owner or one of its editors administers the question.
 *
 * Mirrors `resolveSurveyAccess` in the MC app, which owns these records. Clients
 * cannot write `surveys` or `surveyAdmins` directly (tests/rules/survey-admins).
 *
 * Answers false rather than throwing for a missing survey, so the caller's refusal
 * does not reveal which survey ids exist.
 */
export async function canEditQuestionThroughSurvey(
	uid: string,
	surveyId: string,
	question: Statement,
): Promise<boolean> {
	const surveySnap = await db.collection(Collections.surveys).doc(surveyId).get();
	if (!surveySnap.exists) return false;

	const survey = surveySnap.data() as Survey;
	if (!Array.isArray(survey.questionIds) || !survey.questionIds.includes(question.statementId)) {
		return false;
	}

	if (survey.creatorId !== uid) {
		const adminSnap = await db
			.collection(Collections.surveyAdmins)
			.doc(getSurveyAdminId(surveyId, uid))
			.get();
		const admin = adminSnap.exists ? (adminSnap.data() as Partial<SurveyAdmin>) : {};
		if (!isEditorRecordOf(admin, surveyId, uid)) return false;
	}

	return isQuestionAdministeredByRoster(survey, question);
}

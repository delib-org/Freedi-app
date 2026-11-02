import {
	Collections,
	Survey,
	SurveyAdmin,
	canEditSurvey,
	getSurveyAdminId,
} from '@freedi/shared-types';
import { db } from '../db';

/**
 * Whether `uid` may edit `questionId` because of the survey it sits in: the survey
 * lists the question, and the caller owns the survey or is an editor co-admin of
 * it. Viewers are not. Mirrors `resolveSurveyAccess` in the MC app, which owns
 * these records; both collections are written by servers only.
 *
 * Answers false rather than throwing for a missing survey, so the caller's refusal
 * does not reveal which survey ids exist.
 */
export async function canEditQuestionThroughSurvey(
	uid: string,
	surveyId: string,
	questionId: string,
): Promise<boolean> {
	const surveySnap = await db.collection(Collections.surveys).doc(surveyId).get();
	if (!surveySnap.exists) return false;

	const survey = surveySnap.data() as Survey;
	if (!Array.isArray(survey.questionIds) || !survey.questionIds.includes(questionId)) return false;
	if (survey.creatorId === uid) return true;

	const adminSnap = await db
		.collection(Collections.surveyAdmins)
		.doc(getSurveyAdminId(surveyId, uid))
		.get();
	if (!adminSnap.exists) return false;

	const admin = adminSnap.data() as Partial<SurveyAdmin>;

	return (
		admin.surveyId === surveyId && admin.userId === uid && !!admin.role && canEditSurvey(admin.role)
	);
}

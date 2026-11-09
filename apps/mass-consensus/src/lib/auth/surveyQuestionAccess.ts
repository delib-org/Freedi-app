import { NextResponse } from 'next/server';
import type { Survey } from '@freedi/shared-types';
import { SURVEY_QUESTIONS } from '@/constants/common';
import {
  findQuestionsOutsideRoster,
  surveyRosterUids,
} from '../firebase/surveys/questionAdminAccess';
import { AuthorizationError, logError } from '../utils/errorHandling';

/**
 * Who may put a question into a survey.
 *
 * Saving a survey writes settings onto every question it lists, with the Admin
 * SDK, so listing a question is a write to it. A question may join a survey only
 * when someone running that survey (its owner or an editor) administers it: the
 * same rule as `canEditQuestionThroughSurvey` in
 * functions/src/utils/surveyQuestionAccess.ts.
 *
 * Only questions that are joining are checked. One the survey already holds
 * stays, so a co-admin can re-save a survey holding the owner's questions and a
 * survey whose question has lost its admin can still be edited; the cascades
 * refuse to write to such a question on their own (keepRosterAdministeredWrites).
 */

const QUESTIONS_NOT_ALLOWED = 'You can only add questions that are managed by the admins of this survey';
const TOO_MANY_QUESTIONS = 'Too many questions in one request';

interface DenialContext {
  operation: string;
  userId: string;
  surveyId?: string;
}

/** A Firestore document id: a slash would address a different path. */
export function isValidQuestionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

export function isQuestionIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isValidQuestionId);
}

async function denyQuestionsOutsideRoster(
  resolveRoster: () => Promise<string[]>,
  questionIds: readonly string[],
  context: DenialContext
): Promise<NextResponse | null> {
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) return null;

  if (ids.length > SURVEY_QUESTIONS.MAX_IDS_CHECKED_PER_REQUEST) {
    return NextResponse.json({ error: TOO_MANY_QUESTIONS }, { status: 400 });
  }

  const outside = await findQuestionsOutsideRoster(await resolveRoster(), ids);
  if (outside.length === 0) return null;

  logError(new AuthorizationError('survey question authorization denied'), {
    operation: context.operation,
    userId: context.userId,
    metadata: { surveyId: context.surveyId, questionIds: outside },
  });

  // One answer for "not yours" and "does not exist", so ids cannot be probed.
  return NextResponse.json({ error: QUESTIONS_NOT_ALLOWED }, { status: 403 });
}

/** A new survey has one person running it: the caller. */
export function denyForeignQuestionsOnCreate(
  userId: string,
  questionIds: readonly string[]
): Promise<NextResponse | null> {
  return denyQuestionsOutsideRoster(async () => [userId], questionIds, {
    operation: 'surveyQuestionAccess.denyForeignQuestionsOnCreate',
    userId,
  });
}

/**
 * For a caller already cleared to edit the survey. Checks the ids that are not
 * in the survey yet, and reads nothing when there are none, so an ordinary
 * autosave costs no extra reads.
 */
export async function denyForeignQuestionsOnEdit(
  survey: Pick<Survey, 'surveyId' | 'creatorId' | 'questionIds'>,
  userId: string,
  questionIds: readonly string[]
): Promise<NextResponse | null> {
  const held = new Set(survey.questionIds ?? []);

  return denyQuestionsOutsideRoster(
    () => surveyRosterUids(survey),
    questionIds.filter((id) => !held.has(id)),
    {
      operation: 'surveyQuestionAccess.denyForeignQuestionsOnEdit',
      userId,
      surveyId: survey.surveyId,
    }
  );
}

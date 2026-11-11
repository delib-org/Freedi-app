import {
	Collections,
	ORG_ADMIN_ROLES,
	Role,
	canEditSurvey,
	getOrganizationMemberId,
	type OrganizationMember,
	type Statement,
	type StatementSubscription,
	type Survey,
	type SurveyAdmin,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';

/**
 * Ties a survey to the questions it lists. `survey.questionIds` proves nothing
 * alone: the routes now refuse a foreign question when it joins a survey
 * (lib/auth/surveyQuestionAccess), but surveys saved before that may hold one,
 * and a question's admin can leave the roster later. A write that changes a
 * question may only reach it when the survey's owner or one of its editor
 * co-admins administers the question.
 *
 * The same rule as `canEditQuestionThroughSurvey` in
 * functions/src/utils/surveyQuestionAccess.ts (branch feat/recalculate-indices-admins),
 * whose statement-admin check is `findStatementAdminSource`. MC's own
 * `isAdminOfStatement` is narrower (creator, or a subscription whose role is
 * exactly admin: it misses the statement-creator role, an admin subscription on
 * the top parent, and organization admins), so that check is mirrored here.
 */

/** A survey's co-admins are invited by hand; past this many we stop reading. */
const MAX_SURVEY_ROSTER_READ = 50;
const TOP = 'top';
const ADMIN_ROLES: readonly Role[] = [Role.admin, Role.creator];

async function hasAdminSubscription(uid: string, statementId: string): Promise<boolean> {
	const snap = await getFirestoreAdmin()
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${statementId}`)
		.get();
	if (!snap.exists) return false;
	const role = (snap.data() as Partial<StatementSubscription> | undefined)?.role;

	return !!role && ADMIN_ROLES.includes(role);
}

async function organizationIdOf(statement: Statement): Promise<string | undefined> {
	if (statement.organizationId) return statement.organizationId;
	const top = statement.topParentId;
	if (!top || top === TOP || top === statement.statementId) return undefined;
	const snap = await getFirestoreAdmin().collection(Collections.statements).doc(top).get();

	return snap.exists ? (snap.data() as Partial<Statement>).organizationId : undefined;
}

async function isOrganizationAdmin(uid: string, organizationId: string): Promise<boolean> {
	const snap = await getFirestoreAdmin()
		.collection(Collections.organizationMembers)
		.doc(getOrganizationMemberId(organizationId, uid))
		.get();
	if (!snap.exists) return false;
	const role = (snap.data() as Partial<OrganizationMember>).role;

	return !!role && ORG_ADMIN_ROLES.includes(role);
}

/** Whether `uid` administers `statement`: creator, own or top-parent admin subscription, or org admin. */
export async function administersStatement(uid: string, statement: Statement): Promise<boolean> {
	if (statement.creatorId === uid) return true;
	if (await hasAdminSubscription(uid, statement.statementId)) return true;
	const top = statement.topParentId;
	if (top && top !== TOP && top !== statement.statementId && (await hasAdminSubscription(uid, top))) {
		return true;
	}
	const organizationId = await organizationIdOf(statement);

	return !!organizationId && isOrganizationAdmin(uid, organizationId);
}

/** The people who run the survey: its owner and its accepted editor co-admins. */
export async function surveyRosterUids(survey: Pick<Survey, 'surveyId' | 'creatorId'>): Promise<string[]> {
	const snap = await getFirestoreAdmin()
		.collection(Collections.surveyAdmins)
		.where('surveyId', '==', survey.surveyId)
		.limit(MAX_SURVEY_ROSTER_READ)
		.get();
	const editors = snap.docs
		.map((doc) => doc.data() as Partial<SurveyAdmin>)
		.filter((admin) => !!admin.userId && !!admin.role && canEditSurvey(admin.role))
		.map((admin) => admin.userId as string);

	return [survey.creatorId, ...editors];
}

/** True when someone on the roster administers the question. */
export async function isQuestionAdministeredByRoster(
	rosterUids: readonly string[],
	question: Statement,
): Promise<boolean> {
	const answers = await Promise.all(rosterUids.map((uid) => administersStatement(uid, question)));

	return answers.some(Boolean);
}

/**
 * The ids nobody on the roster administers. A statement that does not exist
 * counts as outside the roster, so a refusal never tells the caller which ids
 * are real.
 */
export async function findQuestionsOutsideRoster(
	rosterUids: readonly string[],
	questionIds: readonly string[],
): Promise<string[]> {
	const db = getFirestoreAdmin();
	const ids = [...new Set(questionIds)];
	const snaps = await Promise.all(
		ids.map((id) => db.collection(Collections.statements).doc(id).get()),
	);
	const verdicts = await Promise.all(
		snaps.map((snap) =>
			snap.exists ? isQuestionAdministeredByRoster(rosterUids, snap.data() as Statement) : false,
		),
	);

	return ids.filter((_, i) => !verdicts[i]);
}

/**
 * The cascade writes that may really happen. The routes refuse a foreign
 * question when it joins a survey, but a survey can already hold one (planted
 * before that check existed, or its admin has since left the roster), and those
 * surveys must stay editable. So the survey keeps listing it and the cascade
 * leaves it alone.
 *
 * Reads the roster only when something would be written: an autosave that
 * changes nothing costs no extra reads. Throws if the roster cannot be read, so
 * a failure means no writes.
 */
export async function keepRosterAdministeredWrites<T extends { question: Statement }>(
	survey: Pick<Survey, 'surveyId' | 'creatorId'>,
	writes: readonly T[],
	operation: string,
): Promise<T[]> {
	if (writes.length === 0) return [];

	const roster = await surveyRosterUids(survey);
	const verdicts = await Promise.all(
		writes.map((write) => isQuestionAdministeredByRoster(roster, write.question)),
	);
	writes.forEach((write, i) => {
		if (verdicts[i]) return;
		logger.warn(`[${operation}] question not administered by the survey roster, left untouched`, {
			operation,
			surveyId: survey.surveyId,
			statementId: write.question.statementId,
		});
	});

	return writes.filter((_, i) => verdicts[i]);
}

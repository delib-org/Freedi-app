import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	OrganizationActivity,
	OrganizationRole,
	functionConfig,
	getOrganizationActivityId,
} from '@freedi/shared-types';
import { db } from '../db';
import type { Statement } from '@freedi/shared-types';
import { commitInChunks, listOrgAdminMembers, requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';
import { loadCallerUser } from './orgStatements';
import {
	activityRef,
	existingAdminSubscribers,
	linkActivityWrites,
	loadLinkableStatement,
	normalizeLabel,
	resolveSurveyQuestion,
} from './orgActivities';

interface LinkOrgStatementRequest {
	organizationId: string;
	/** The question to add. Supply this or `surveyId`. */
	statementId?: string;
	/**
	 * A Mass-Consensus survey to add, by id. Resolved server-side to the
	 * question the survey wraps — clients cannot read the surveys collection.
	 */
	surveyId?: string;
	/** Org-facing name. Empty → the board falls back to the question's own title. */
	label?: string;
}

interface LinkOrgStatementResult {
	activityId: string;
	/** The question actually linked — the caller may have named a survey. */
	statementId: string;
	/**
	 * Every question this link covers: just `statementId`, or all of a survey's
	 * questions. The caller rebuilds participation counters for each.
	 */
	questionIds: string[];
}

/**
 * Adds a question or survey that already exists to an organization's board.
 *
 * The question is *linked*, not moved: nothing on the statement changes, it
 * keeps its own home and can be linked into more than one organization. What
 * the link does grant is authority — every org admin gets an admin
 * subscription on it — which is why the question has to come from inside the
 * organization's circle of trust (see `loadLinkableStatement`).
 *
 * A Mass-Consensus survey may be named instead of a question. The survey is
 * then the unit: the link covers every question in it, the board shows it as
 * one crowd-survey activity, and unlinking gives all of it back.
 */
export const fn_linkOrgStatement = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LinkOrgStatementRequest>): Promise<LinkOrgStatementResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, surveyId, label } = request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		const hasStatement = typeof request.data?.statementId === 'string' && request.data.statementId;
		const hasSurvey = typeof surveyId === 'string' && surveyId;
		if (!hasStatement && !hasSurvey) {
			throw new HttpsError('invalid-argument', 'statementId or surveyId is required');
		}
		const trimmedLabel = normalizeLabel(label);

		const member = await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		const admins = await listOrgAdminMembers(organizationId);
		if (!admins.some((admin) => admin.userId === caller.uid)) {
			admins.push(member);
		}
		const adminUserIds = new Set(admins.map((admin) => admin.userId));

		// A survey is not a statement: resolve it to the questions it wraps first,
		// then everything below treats the two entry points identically. The
		// survey itself is kept on the link so the board can show it as one
		// crowd-survey activity — a Studio client cannot read `surveys`.
		const survey = hasSurvey ? await resolveSurveyQuestion(surveyId as string) : null;
		const statementId = hasStatement
			? (request.data.statementId as string)
			: (survey?.questionIds[0] as string);

		const statement = await loadLinkableStatement({
			uid: caller.uid,
			organizationId,
			statementId,
			adminUserIds,
		});

		// A survey is administered whole: its other questions are part of the
		// same activity, and the board sums their participation.
		const coveredIds = survey ? survey.questionIds : [statementId];
		const others = await Promise.all(
			coveredIds
				.filter((id) => id !== statementId)
				.map(async (id) => {
					const snap = await db.collection(Collections.statements).doc(id).get();

					return snap.exists ? (snap.data() as Statement) : null;
				}),
		);
		const statements = [statement, ...others.filter((s): s is Statement => s !== null)];
		const coveredStatementIds = statements.map((s) => s.statementId);
		if (statement.organizationId === organizationId) {
			throw new HttpsError('already-exists', 'This organization already owns that question');
		}
		const linkRef = activityRef(organizationId, statementId);
		if ((await linkRef.get()).exists) {
			throw new HttpsError('already-exists', 'That question is already on this board');
		}

		const user = await loadCallerUser(caller.uid, caller);
		const now = Date.now();
		const [held, progressSnaps] = await Promise.all([
			existingAdminSubscribers(
				coveredStatementIds,
				admins.map((admin) => admin.userId),
			),
			db.getAll(
				...coveredStatementIds.map((id) => db.collection(Collections.questionProgress).doc(id)),
			),
		]);
		const hasProgress = new Set(progressSnaps.filter((snap) => snap.exists).map((snap) => snap.id));

		// Anyone the link promoted on at least one covered question. Unlink
		// re-checks each question before demoting, so a wider list is harmless.
		const grantedTo = admins
			.map((admin) => admin.userId)
			.filter((userId) => coveredStatementIds.some((id) => !(held.get(id)?.has(userId) ?? false)));

		const activity: OrganizationActivity = {
			activityId: getOrganizationActivityId(organizationId, statementId),
			organizationId,
			statementId,
			statementTitle: statement.statement,
			addedBy: caller.uid,
			addedByDisplayName: user.displayName,
			addedAt: now,
			lastUpdate: now,
			grantedTo,
		};
		if (trimmedLabel) activity.label = trimmedLabel;
		if (survey) {
			activity.surveyId = survey.surveyId;
			activity.surveyTitle = survey.title;
			// What was actually covered, not what the survey claims: a question the
			// survey lists but that no longer exists was granted nothing, and the
			// board must not go looking for its progress.
			activity.surveyQuestionIds = coveredStatementIds;
		}

		await commitInChunks(
			linkActivityWrites({
				statements,
				organizationId,
				admins,
				activity,
				hasProgress,
				skipSubscriptionFor: held,
				now,
			}),
		);

		logger.info('[fn_linkOrgStatement] Existing question linked', {
			organizationId,
			statementId,
			admins: admins.length,
			labelled: Boolean(trimmedLabel),
			via: hasStatement ? 'statement' : 'survey',
		});

		return {
			activityId: activity.activityId,
			statementId,
			questionIds: coveredStatementIds,
		};
	},
);

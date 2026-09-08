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
}

/**
 * Adds a question or survey that already exists to an organization's board.
 *
 * The question is *linked*, not moved: nothing on the statement changes, it
 * keeps its own home and can be linked into more than one organization. What
 * the link does grant is authority — every org admin gets an admin
 * subscription on it — which is why the caller must already administer the
 * question themselves (see `loadLinkableStatement`).
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

		// A survey is not a statement: resolve it to the question it wraps first,
		// then everything below treats the two entry points identically.
		const statementId = hasStatement
			? (request.data.statementId as string)
			: await resolveSurveyQuestion(surveyId as string);

		const statement = await loadLinkableStatement({
			uid: caller.uid,
			organizationId,
			statementId,
			adminUserIds,
		});
		if (statement.organizationId === organizationId) {
			throw new HttpsError('already-exists', 'This organization already owns that question');
		}
		const linkRef = activityRef(organizationId, statementId);
		if ((await linkRef.get()).exists) {
			throw new HttpsError('already-exists', 'That question is already on this board');
		}

		const user = await loadCallerUser(caller.uid, caller);
		const now = Date.now();
		const [held, progressSnap] = await Promise.all([
			existingAdminSubscribers(
				statementId,
				admins.map((admin) => admin.userId),
			),
			db.collection(Collections.questionProgress).doc(statementId).get(),
		]);

		const grantedTo = admins.map((admin) => admin.userId).filter((userId) => !held.has(userId));

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

		await commitInChunks(
			linkActivityWrites({
				statement,
				organizationId,
				admins,
				activity,
				hasProgress: progressSnap.exists,
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

		return { activityId: activity.activityId, statementId };
	},
);

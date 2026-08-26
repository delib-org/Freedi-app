import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Access,
	Collections,
	Organization,
	OrganizationRole,
	QuestionStatus,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../db';
import { commitInChunks, listOrgAdminMembers, requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';
import {
	buildChildQuestion,
	buildTopQuestion,
	callerHasTopSubscription,
	childQuestionWrites,
	loadCallerUser,
	loadOrgTopQuestion,
	nextChildOrder,
	topQuestionWrites,
	type OrgChildKind,
	type OrgStatementKind,
} from './orgStatements';

export type { OrgStatementKind } from './orgStatements';

interface CreateOrgStatementRequest {
	organizationId: string;
	title: string;
	description?: string;
	kind: OrgStatementKind;
	parentId?: string;
	access?: Access;
	initialStatus?: QuestionStatus;
}

interface CreateOrgStatementResult {
	statementId: string;
}

const KINDS: ReadonlySet<string> = new Set(['topQuestion', 'massConsensus', 'join', 'question']);
const STATUSES: ReadonlySet<string> = new Set(['live', 'frozen', 'closed']);
const ACCESS_VALUES: ReadonlySet<string> = new Set(Object.values(Access));

/**
 * Org owner/admin creates either a top question (owned by the org) or a
 * sub-question under one (Mass Consensus / Join / plain). Top questions get
 * admin subscriptions for every org admin; children rely on
 * `onStatementCreated` to fan those out. Builders live in `orgStatements.ts`
 * and are shared with the AI plan builder.
 */
export const fn_createOrgStatement = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<CreateOrgStatementRequest>,
	): Promise<CreateOrgStatementResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, title, description, kind, parentId, access, initialStatus } =
			request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		const trimmedTitle = typeof title === 'string' ? title.trim() : '';
		if (!trimmedTitle) {
			throw new HttpsError('invalid-argument', 'title is required');
		}
		if (!KINDS.has(kind)) {
			throw new HttpsError('invalid-argument', 'Invalid kind');
		}
		if (initialStatus !== undefined && !STATUSES.has(initialStatus)) {
			throw new HttpsError('invalid-argument', 'Invalid initialStatus');
		}
		if (access !== undefined && !ACCESS_VALUES.has(access)) {
			throw new HttpsError('invalid-argument', 'Invalid access');
		}
		if (kind !== 'topQuestion' && (!parentId || typeof parentId !== 'string')) {
			throw new HttpsError('invalid-argument', 'parentId is required for sub-questions');
		}

		const member = await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		const orgSnap = await db.collection(Collections.organizations).doc(organizationId).get();
		if (!orgSnap.exists) {
			throw new HttpsError('not-found', 'Organization not found');
		}
		const organization = orgSnap.data() as Organization;

		const user = await loadCallerUser(caller.uid, caller);
		const now = Date.now();
		const questionStatus: QuestionStatus = initialStatus ?? 'live';
		const trimmedDescription = typeof description === 'string' ? description.trim() : '';
		const statementId = db.collection(Collections.statements).doc().id;
		const actor = {
			uid: caller.uid,
			user,
			member: { ...member, email: user.email ?? '', displayName: user.displayName },
		};

		if (kind === 'topQuestion') {
			const statement = buildTopQuestion({
				statementId,
				organization,
				actor,
				title: trimmedTitle,
				description: trimmedDescription || undefined,
				access,
				questionStatus,
			});
			const admins = await listOrgAdminMembers(organizationId);
			if (!admins.some((admin) => admin.userId === caller.uid)) {
				admins.push({ ...member, email: user.email ?? '', displayName: user.displayName });
			}
			await commitInChunks(topQuestionWrites({ statement, organizationId, admins, now }));

			logger.info('[fn_createOrgStatement] Top question created', {
				organizationId,
				statementId,
				admins: admins.length,
			});

			return { statementId };
		}

		// ── Sub-question under an org top question ──
		const childKind = kind as OrgChildKind;
		const parent = await loadOrgTopQuestion(parentId as string, organizationId);
		const order = await nextChildOrder(parent.statementId);
		const statement = buildChildQuestion({
			statementId,
			parent,
			kind: childKind,
			actor,
			title: trimmedTitle,
			description: trimmedDescription || undefined,
			order,
			questionStatus,
		});
		const topSubExists =
			childKind === 'join' ? await callerHasTopSubscription(caller.uid, parent.statementId) : false;
		await commitInChunks(
			childQuestionWrites({
				statement,
				parent,
				organizationId,
				kind: childKind,
				actor,
				now,
				topSubExists,
			}),
		);

		logger.info('[fn_createOrgStatement] Sub-question created', {
			organizationId,
			statementId,
			parentId: parent.statementId,
			kind,
			order: statement.order,
		});

		return { statementId };
	},
);

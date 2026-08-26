import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Access,
	Collections,
	Organization,
	OrganizationRole,
	QuestionProgress,
	QuestionStatus,
	QuestionType,
	SourceApp,
	Statement,
	StatementType,
	User,
	createStatementObject,
	defaultStatementSettings,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../db';
import { buildAdminSubscription, listOrgAdminMembers, requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';

export type OrgStatementKind = 'topQuestion' | 'massConsensus' | 'join' | 'question';

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

const CHILD_MARKERS: Record<
	Exclude<OrgStatementKind, 'topQuestion'>,
	{ sourceApp: SourceApp; questionType: QuestionType }
> = {
	massConsensus: { sourceApp: SourceApp.MASS_CONSENSUS, questionType: QuestionType.massConsensus },
	join: { sourceApp: SourceApp.JOIN, questionType: QuestionType.simple },
	question: { sourceApp: SourceApp.MAIN, questionType: QuestionType.simple },
};

async function loadCallerUser(
	uid: string,
	fallback: { email: string | null; displayName: string },
): Promise<User> {
	const snap = await db.collection(Collections.users).doc(uid).get();
	const stored = snap.exists ? (snap.data() as Partial<User>) : undefined;

	return {
		uid,
		displayName: stored?.displayName?.trim() || fallback.displayName,
		email: stored?.email ?? fallback.email ?? '',
		photoURL: stored?.photoURL ?? '',
		isAnonymous: false,
	};
}

function seedProgress(
	statementId: string,
	topParentId: string,
	organizationId: string,
	now: number,
): QuestionProgress {
	return {
		statementId,
		topParentId,
		organizationId,
		entered: 0,
		suggested: 0,
		evaluated: 0,
		options: 0,
		evaluations: 0,
		lastActivity: now,
		lastUpdate: now,
	};
}

/**
 * Org owner/admin creates either a top question (owned by the org) or a
 * sub-question under one (Mass Consensus / Join / plain). Top questions get
 * admin subscriptions for every org admin; children rely on
 * `onStatementCreated` to fan those out.
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
		const statementRef = db.collection(Collections.statements).doc();
		const statementId = statementRef.id;
		const batch = db.batch();

		if (kind === 'topQuestion') {
			const statement = createStatementObject({
				statement: trimmedTitle,
				statementType: StatementType.question,
				parentId: 'top',
				topParentId: statementId,
				statementId,
				creatorId: caller.uid,
				creator: user,
				statementSettings: { ...defaultStatementSettings, questionStatus },
				sourceApp: SourceApp.MAIN,
			});
			if (!statement) {
				throw new HttpsError('internal', 'Failed to build the question');
			}
			statement.organizationId = organizationId;
			statement.membership = {
				access: access ?? organization.defaultAccess ?? Access.openToAll,
			};
			statement.questionSettings = { questionType: QuestionType.simple };
			if (trimmedDescription) statement.description = trimmedDescription;

			batch.set(statementRef, statement);

			const admins = await listOrgAdminMembers(organizationId);
			if (!admins.some((admin) => admin.userId === caller.uid)) {
				admins.push({ ...member, email: user.email ?? '', displayName: user.displayName });
			}
			admins.forEach((admin) => {
				const sub = buildAdminSubscription(statement, admin, now);
				batch.set(
					db.collection(Collections.statementsSubscribe).doc(sub.statementsSubscribeId),
					sub,
				);
			});

			batch.update(orgSnap.ref, {
				questionCount: FieldValue.increment(1),
				lastUpdate: now,
			});
			batch.set(
				db.collection(Collections.questionProgress).doc(statementId),
				seedProgress(statementId, statementId, organizationId, now),
			);
			await batch.commit();

			logger.info('[fn_createOrgStatement] Top question created', {
				organizationId,
				statementId,
				admins: admins.length,
			});

			return { statementId };
		}

		// ── Sub-question under an org top question ──
		const parentSnap = await db
			.collection(Collections.statements)
			.doc(parentId as string)
			.get();
		if (!parentSnap.exists) {
			throw new HttpsError('not-found', 'Parent question not found');
		}
		const parent = parentSnap.data() as Statement;
		if (parent.parentId !== 'top') {
			throw new HttpsError(
				'failed-precondition',
				'Sub-questions can only be added under a top question',
			);
		}
		if (parent.organizationId !== organizationId) {
			throw new HttpsError(
				'permission-denied',
				'Parent question belongs to a different organization',
			);
		}

		const siblingsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', parent.statementId)
			.get();
		const maxOrder = siblingsSnap.docs.reduce((max, doc) => {
			const order = (doc.data() as Statement).order;

			return typeof order === 'number' && order > max ? order : max;
		}, -1);

		const markers = CHILD_MARKERS[kind as Exclude<OrgStatementKind, 'topQuestion'>];
		const statement = createStatementObject({
			statement: trimmedTitle,
			statementType: StatementType.question,
			parentId: parent.statementId,
			topParentId: parent.statementId,
			parents: [parent.statementId],
			statementId,
			creatorId: caller.uid,
			creator: user,
			statementSettings: { ...defaultStatementSettings, questionStatus },
			sourceApp: markers.sourceApp,
		});
		if (!statement) {
			throw new HttpsError('internal', 'Failed to build the question');
		}
		statement.order = maxOrder + 1;
		statement.questionSettings = { questionType: markers.questionType };
		if (trimmedDescription) statement.description = trimmedDescription;

		batch.set(statementRef, statement);
		batch.set(
			db.collection(Collections.questionProgress).doc(statementId),
			seedProgress(statementId, parent.statementId, organizationId, now),
		);

		if (kind === 'join') {
			// Mark the hub on the caller's own top-question subscription so the
			// Join app's "Main" list shows it (mirrors joinSubscriptions.ts).
			const topSubRef = db
				.collection(Collections.statementsSubscribe)
				.doc(`${caller.uid}--${parent.statementId}`);
			const topSub = await topSubRef.get();
			if (topSub.exists) {
				batch.set(topSubRef, { openedInJoin: now, lastUpdate: now }, { merge: true });
			} else {
				const sub = buildAdminSubscription(
					parent,
					{ ...member, email: user.email ?? '', displayName: user.displayName },
					now,
				);
				batch.set(topSubRef, { ...sub, openedInJoin: now });
			}
		}

		await batch.commit();

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

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	OrganizationActivity,
	Role,
	Statement,
	StatementSubscription,
	StatementType,
	getOrganizationActivityId,
} from '@freedi/shared-types';
import { db } from '../db';
import { isSystemAdmin } from '../utils/httpAuth';
import { buildAdminSubscription } from './orgAuth';
import { seedProgress, type BatchWrite, type OrgActorMember } from './orgStatements';

/**
 * Helpers behind "add an existing question to this organization".
 *
 * A linked question is NOT owned by the organization: its `organizationId`,
 * `parentId` and `topParentId` are left exactly as they are, so it keeps
 * working wherever it already lives and can be linked into several
 * organizations at once. The connection lives in `organizationActivities`.
 */

/** Longest org-facing label we accept — a board card, not a description. */
export const MAX_ACTIVITY_LABEL = 140;

/** Subscription roles that already grant administration of a statement. */
const ADMIN_SUB_ROLES: ReadonlySet<Role> = new Set([Role.admin, Role.creator]);

export function activityRef(organizationId: string, statementId: string) {
	return db
		.collection(Collections.organizationActivities)
		.doc(getOrganizationActivityId(organizationId, statementId));
}

/** Trim a caller-supplied label; an empty one means "use the statement's title". */
export function normalizeLabel(label: unknown): string | undefined {
	if (typeof label !== 'string') return undefined;
	const trimmed = label.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > MAX_ACTIVITY_LABEL) {
		throw new HttpsError('invalid-argument', 'The name is too long');
	}

	return trimmed;
}

/**
 * Loads a statement the caller is allowed to hand to an organization.
 *
 * Linking grants every org admin authority over the question, so the caller
 * must already hold that authority themselves: be its creator, hold an admin
 * subscription on it, or be a system admin. Org membership alone is not
 * enough — otherwise any org admin could annex someone else's question.
 */
export async function loadLinkableStatement(uid: string, statementId: string): Promise<Statement> {
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	if (!snap.exists) {
		throw new HttpsError('not-found', 'Question not found');
	}
	const statement = snap.data() as Statement;
	if (statement.statementType !== StatementType.question) {
		throw new HttpsError('invalid-argument', 'Only questions and surveys can be added');
	}
	if (statement.creatorId === uid) return statement;

	const subSnap = await db
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${statementId}`)
		.get();
	const role = subSnap.exists ? (subSnap.data() as StatementSubscription).role : undefined;
	if (role && ADMIN_SUB_ROLES.has(role)) return statement;

	if (await isSystemAdmin(uid)) return statement;

	throw new HttpsError('permission-denied', 'You can only add questions you administer');
}

export interface LinkActivityWritesInput {
	statement: Statement;
	organizationId: string;
	admins: OrgActorMember[];
	activity: OrganizationActivity;
	/** True when `questionProgress/{statementId}` already exists. */
	hasProgress: boolean;
	/** Subscriptions that already grant admin/creator — never downgrade those. */
	skipSubscriptionFor: ReadonlySet<string>;
	now: number;
}

/**
 * Batch writes for linking: the link record, an admin subscription per org
 * admin who lacks one, the org's question counter and — only if the question
 * has none yet — a progress seed. The statement document itself is untouched.
 */
export function linkActivityWrites(input: LinkActivityWritesInput): BatchWrite[] {
	const { statement, organizationId, admins, activity, hasProgress, skipSubscriptionFor, now } =
		input;
	const writes: BatchWrite[] = [];

	writes.push((batch) => batch.set(activityRef(organizationId, statement.statementId), activity));

	admins.forEach((admin) => {
		if (skipSubscriptionFor.has(admin.userId)) return;
		const sub = buildAdminSubscription(statement, admin, now);
		writes.push((batch) =>
			batch.set(
				db.collection(Collections.statementsSubscribe).doc(sub.statementsSubscribeId),
				sub,
				{ merge: true },
			),
		);
	});

	writes.push((batch) =>
		batch.update(db.collection(Collections.organizations).doc(organizationId), {
			questionCount: FieldValue.increment(1),
			lastUpdate: now,
		}),
	);

	if (!hasProgress) {
		// A progress doc is per-statement, not per-org: if the question already
		// belongs to another organization that owning id stays authoritative —
		// it is what the progress writer would derive from the top parent anyway.
		writes.push((batch) =>
			batch.set(
				db.collection(Collections.questionProgress).doc(statement.statementId),
				seedProgress(
					statement.statementId,
					statement.topParentId ?? statement.statementId,
					statement.organizationId ?? organizationId,
					now,
				),
			),
		);
	}

	return writes;
}

/**
 * Which of `userIds` already hold an admin or creator subscription on the
 * statement. Those are left alone on link and on unlink.
 */
export async function existingAdminSubscribers(
	statementId: string,
	userIds: string[],
): Promise<Set<string>> {
	const held = new Set<string>();
	await Promise.all(
		userIds.map(async (userId) => {
			const snap = await db
				.collection(Collections.statementsSubscribe)
				.doc(`${userId}--${statementId}`)
				.get();
			if (!snap.exists) return;
			const role = (snap.data() as StatementSubscription).role;
			if (role && ADMIN_SUB_ROLES.has(role)) held.add(userId);
		}),
	);

	return held;
}

/** All linked statement ids for an organization. */
export async function listOrgLinkedStatementIds(organizationId: string): Promise<string[]> {
	const snap = await db
		.collection(Collections.organizationActivities)
		.where('organizationId', '==', organizationId)
		.get();

	return snap.docs.map((doc) => (doc.data() as OrganizationActivity).statementId);
}

/**
 * Which of `userIds` should lose admin when a link is removed: those whose
 * subscription still exists and still reads `admin`. A member removed from the
 * org in the meantime has already been demoted, and a subscription someone
 * upgraded to creator since is not the link's to take away.
 */
export async function demotableSubscribers(
	statementId: string,
	userIds: string[],
): Promise<string[]> {
	const demotable: string[] = [];
	await Promise.all(
		userIds.map(async (userId) => {
			const snap = await db
				.collection(Collections.statementsSubscribe)
				.doc(`${userId}--${statementId}`)
				.get();
			if (!snap.exists) return;
			if ((snap.data() as StatementSubscription).role === Role.admin) demotable.push(userId);
		}),
	);

	return demotable;
}

/** Writes that remove a link: the record, the counter, and the granted subs. */
export function unlinkActivityWrites(
	organizationId: string,
	statementId: string,
	demoteUserIds: string[],
	now: number,
): BatchWrite[] {
	const writes: BatchWrite[] = [
		(batch) => batch.delete(activityRef(organizationId, statementId)),
		(batch) =>
			batch.update(db.collection(Collections.organizations).doc(organizationId), {
				questionCount: FieldValue.increment(-1),
				lastUpdate: now,
			}),
	];
	demoteUserIds.forEach((userId) => {
		writes.push((batch) =>
			batch.update(
				db.collection(Collections.statementsSubscribe).doc(`${userId}--${statementId}`),
				{ role: Role.member, lastUpdate: now },
			),
		);
	});

	return writes;
}

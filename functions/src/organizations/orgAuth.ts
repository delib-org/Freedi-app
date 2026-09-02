import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { createHash } from 'crypto';
import type { WriteBatch } from 'firebase-admin/firestore';
import {
	Collections,
	ORG_ADMIN_ROLES,
	OrganizationMember,
	OrganizationRole,
	Role,
	Statement,
	StatementSubscription,
	getOrganizationMemberId,
	getStatementSubscriptionId,
	statementToSimpleStatement,
} from '@freedi/shared-types';
import { db } from '../db';
import { isSystemAdmin } from '../utils/httpAuth';

/** Firestore batches cap at 500 writes; keep headroom for paired writes. */
export const ORG_BATCH_CHUNK = 400;

/** Statement subscription roles that must never be downgraded by org tooling. */
const PROTECTED_SUB_ROLES: ReadonlySet<Role> = new Set([Role.admin, Role.creator]);

/**
 * Loads the caller's membership in `organizationId` and asserts its role is
 * one of `roles`. System admins pass every check: if they have a member doc it
 * is returned as-is, otherwise a synthetic `owner` record is returned so
 * callers can treat the result uniformly.
 */
export async function requireOrgRole(
	uid: string,
	organizationId: string,
	roles: OrganizationRole[],
): Promise<OrganizationMember> {
	const memberRef = db
		.collection(Collections.organizationMembers)
		.doc(getOrganizationMemberId(organizationId, uid));

	if (await isSystemAdmin(uid)) {
		const snap = await memberRef.get();
		if (snap.exists) return snap.data() as OrganizationMember;

		const now = Date.now();

		return {
			memberId: memberRef.id,
			organizationId,
			userId: uid,
			email: '',
			displayName: 'System admin',
			role: OrganizationRole.owner,
			addedAt: now,
			addedBy: uid,
			lastUpdate: now,
		};
	}

	const snap = await memberRef.get();
	if (!snap.exists) {
		throw new HttpsError('permission-denied', 'You are not a member of this organization');
	}
	const member = snap.data() as OrganizationMember;
	if (!roles.includes(member.role)) {
		throw new HttpsError(
			'permission-denied',
			`This action requires one of the roles: ${roles.join(', ')}`,
		);
	}

	return member;
}

/** All members whose role may administer the organization (owner / admin). */
export async function listOrgAdminMembers(organizationId: string): Promise<OrganizationMember[]> {
	const snap = await db
		.collection(Collections.organizationMembers)
		.where('organizationId', '==', organizationId)
		.get();

	return snap.docs
		.map((doc) => doc.data() as OrganizationMember)
		.filter((member) => ORG_ADMIN_ROLES.includes(member.role));
}

/**
 * Admin subscription for an org member on one of the organization's top
 * questions. Mirrors the shape written by `packages/event-core/createEvent`
 * (explicit object, not `createSubscription()` which pins `user` to the
 * statement creator).
 */
export function buildAdminSubscription(
	statement: Statement,
	member: Pick<OrganizationMember, 'userId' | 'displayName' | 'email' | 'organizationId'>,
	now: number,
): StatementSubscription {
	const user = {
		uid: member.userId,
		displayName: member.displayName || member.email || 'Organization admin',
		email: member.email || null,
		isAnonymous: false,
	};
	const statementsSubscribeId =
		getStatementSubscriptionId(statement.statementId, user) ??
		`${member.userId}--${statement.statementId}`;

	return {
		role: Role.admin,
		userId: member.userId,
		statementId: statement.statementId,
		statementsSubscribeId,
		statement: statementToSimpleStatement(statement),
		user,
		lastUpdate: now,
		createdAt: now,
		parentId: statement.parentId,
		statementType: statement.statementType,
		topParentId: statement.topParentId,
		organizationId: member.organizationId,
		getInAppNotification: true,
	};
}

async function listOrgTopQuestions(organizationId: string): Promise<Statement[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('organizationId', '==', organizationId)
		.get();

	return snap.docs.map((doc) => doc.data() as Statement);
}

export async function commitInChunks(writes: Array<(batch: WriteBatch) => void>): Promise<void> {
	for (let i = 0; i < writes.length; i += ORG_BATCH_CHUNK) {
		const batch = db.batch();
		writes.slice(i, i + ORG_BATCH_CHUNK).forEach((apply) => apply(batch));
		await batch.commit();
	}
}

/**
 * Grants `member` an admin subscription on every top question owned by the
 * organization. Existing admin/creator subscriptions are left untouched so we
 * never downgrade a question creator. Returns the number of subscriptions
 * written.
 */
export async function materializeOrgAdminOnTopQuestions(
	organizationId: string,
	member: OrganizationMember,
): Promise<number> {
	const questions = await listOrgTopQuestions(organizationId);
	if (questions.length === 0) return 0;

	const now = Date.now();
	const writes: Array<(batch: WriteBatch) => void> = [];

	await Promise.all(
		questions.map(async (statement) => {
			const subRef = db
				.collection(Collections.statementsSubscribe)
				.doc(`${member.userId}--${statement.statementId}`);
			const existing = await subRef.get();
			if (existing.exists) {
				const role = (existing.data() as StatementSubscription | undefined)?.role;
				if (role && PROTECTED_SUB_ROLES.has(role)) return;
			}
			const sub = buildAdminSubscription(statement, member, now);
			writes.push((batch) => batch.set(subRef, sub, { merge: true }));
		}),
	);

	await commitInChunks(writes);
	logger.info('[orgAuth] materializeOrgAdminOnTopQuestions', {
		organizationId,
		userId: member.userId,
		written: writes.length,
	});

	return writes.length;
}

/**
 * Drops a removed member from `admin` to `member` on every org top question.
 * Questions the user personally created are skipped — creator authority is
 * theirs regardless of org membership. Returns the number of demotions.
 */
export async function demoteOrgMemberOnTopQuestions(
	organizationId: string,
	userId: string,
): Promise<number> {
	const questions = await listOrgTopQuestions(organizationId);
	if (questions.length === 0) return 0;

	const now = Date.now();
	const writes: Array<(batch: WriteBatch) => void> = [];

	await Promise.all(
		questions.map(async (statement) => {
			if (statement.creatorId === userId) return;
			const subRef = db
				.collection(Collections.statementsSubscribe)
				.doc(`${userId}--${statement.statementId}`);
			const existing = await subRef.get();
			if (!existing.exists) return;
			const role = (existing.data() as StatementSubscription | undefined)?.role;
			if (role !== Role.admin) return;
			writes.push((batch) => batch.update(subRef, { role: Role.member, lastUpdate: now }));
		}),
	);

	await commitInChunks(writes);
	logger.info('[orgAuth] demoteOrgMemberOnTopQuestions', {
		organizationId,
		userId,
		demoted: writes.length,
	});

	return writes.length;
}

/** SHA-256 hex of a raw invite token — only the hash is persisted. */
export function hashToken(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

/**
 * Base URL of the WizCol Studio console (where `/invite?token=` lives).
 * `STUDIO_APP_BASE_URL` wins; otherwise derive from `DOMAIN` like the Join
 * helper does. The default is the Firebase hosting site (`.firebaserc` target
 * `studio` → `wizcol-studio`); a custom domain (studio.wizcol.com?) has NOT
 * been confirmed yet — set `STUDIO_APP_BASE_URL` once it is.
 */
export function getStudioBaseUrl(): string {
	const explicit = process.env.STUDIO_APP_BASE_URL;
	if (explicit) return explicit.replace(/\/+$/, '');

	const currentDomain = process.env.DOMAIN || process.env.FUNCTION_TARGET;
	switch (currentDomain) {
		case 'localhost':
			return 'http://localhost:3008';
		default:
			return 'https://wizcol-studio.web.app';
	}
}

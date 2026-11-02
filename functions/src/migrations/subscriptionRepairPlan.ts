import { identityProblems } from '../utils/subscriptionIdentity';
import type { SubscriptionFields } from '../utils/subscriptionIdentity';
import type { PersonIdentity } from '../utils/personIdentity';

/**
 * Pure decisions of scripts/backfillSubscriptionCreatedAt.ts: which admin
 * subscriptions need repair, and exactly which fields a repair writes.
 *
 * Two faults, both from the server's admin copies: no `createdAt` (the Members
 * list orders by it, so the doc is never listed) and `user` holding somebody
 * else, the statement's creator (the person is `userId`).
 *
 * A doc whose `user` is already its own person is current even without
 * `isAnonymous`: client-written docs carry none by design, and rewriting them
 * would be churn. No earlier version of this repair has run on a real project,
 * so there are no repaired docs to migrate.
 */

export type RepairCandidate = SubscriptionFields & { createdAt?: unknown };

export type RepairAssessment =
	| { kind: 'current'; hasNonNumberCreatedAt: boolean }
	/** Its id is not `${userId}--${statementId}`: forged or garbage, never repaired into shape. */
	| { kind: 'id-mismatch' }
	| { kind: 'repair'; needsCreatedAt: boolean; needsUser: boolean; hasNonNumberCreatedAt: boolean };

export function assessSubscription(docId: string, data: RepairCandidate): RepairAssessment {
	if (identityProblems(docId, data).includes('id-mismatch')) return { kind: 'id-mismatch' };

	const needsCreatedAt = data.createdAt === undefined;
	const hasNonNumberCreatedAt = !needsCreatedAt && typeof data.createdAt !== 'number';
	const needsUser = data.user?.uid !== data.userId;

	return needsCreatedAt || needsUser
		? { kind: 'repair', needsCreatedAt, needsUser, hasNonNumberCreatedAt }
		: { kind: 'current', hasNonNumberCreatedAt };
}

interface TimestampLike {
	toMillis?: () => unknown;
	seconds?: unknown;
	_seconds?: unknown;
}

const MILLIS_PER_SECOND = 1000;

/** Milliseconds from a number or a Firestore Timestamp (live or serialized); else undefined. */
export function toMillis(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
	if (typeof value !== 'object' || value === null) return undefined;

	const timestamp = value as TimestampLike;
	if (typeof timestamp.toMillis === 'function') return toMillis(timestamp.toMillis());
	const seconds = timestamp.seconds ?? timestamp._seconds;

	return typeof seconds === 'number' ? toMillis(seconds * MILLIS_PER_SECOND) : undefined;
}

/** When a subscription's statement began: its `createdAt`, else its `lastUpdate`. */
export function statementDateMillis(statement: {
	createdAt?: unknown;
	lastUpdate?: unknown;
}): number | undefined {
	return toMillis(statement.createdAt) ?? toMillis(statement.lastUpdate);
}

export interface BackfillRunEnv {
	project: string | undefined;
	firestoreEmulator: boolean;
	authEmulator: boolean;
	dryRun: boolean;
	confirmProd: boolean;
}

/** Why this run must not start; undefined when it may. */
export function backfillRunRefusal({
	project,
	firestoreEmulator,
	authEmulator,
	dryRun,
	confirmProd,
}: BackfillRunEnv): string | undefined {
	// Unset, firebase-admin takes the ADC default project: one nobody named.
	if (!project?.trim()) return 'Set GCLOUD_PROJECT: every run must name its project.';
	// One emulated and one real would read people from one place and write to the
	// other: real Auth names onto an emulator, or blanks onto a real project.
	if (firestoreEmulator !== authEmulator) {
		return 'Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST, or neither.';
	}
	// A dry run only reads, so it may look at a real project unconfirmed. Writing
	// to one still takes --confirm-prod.
	if (!firestoreEmulator && !dryRun && !confirmProd) {
		return 'Refusing to write to a real project without --confirm-prod (or point the emulator hosts at an emulator; --dry-run reads only).';
	}

	return undefined;
}

export interface RepairPatch {
	createdAt?: number;
	user?: PersonIdentity;
}

/**
 * Only the missing parts. `user` goes in whole, so a Firestore update replaces
 * the map and the creator's other fields (email included) leave the doc.
 * `identity` must be the subscriber's own; empty result means nothing to write.
 */
export function buildRepairPatch(
	{ needsCreatedAt, needsUser }: { needsCreatedAt: boolean; needsUser: boolean },
	statementDate: number | undefined,
	identity: PersonIdentity,
): RepairPatch {
	return {
		...(needsCreatedAt && statementDate !== undefined ? { createdAt: statementDate } : {}),
		...(needsUser ? { user: identity } : {}),
	};
}

export type RepairCounter =
	| 'scanned'
	| 'current'
	| 'writes'
	| 'createdAtSet'
	| 'userSet'
	| 'userSetNameless'
	| 'statementDeleted'
	| 'noStatementDate'
	| 'nonNumberCreatedAt'
	| 'idMismatch'
	| 'schemaInvalid'
	| 'noStatementType';

export type RepairCounts = Record<RepairCounter, number>;

export function emptyRepairCounts(): RepairCounts {
	return {
		scanned: 0,
		current: 0,
		writes: 0,
		createdAtSet: 0,
		userSet: 0,
		userSetNameless: 0,
		statementDeleted: 0,
		noStatementDate: 0,
		nonNumberCreatedAt: 0,
		idMismatch: 0,
		schemaInvalid: 0,
		noStatementType: 0,
	};
}

/** Counts and sample doc ids. Ids hold uids, never names. */
export function formatRepairReport(
	counts: RepairCounts,
	samples: ReadonlyMap<string, ReadonlyArray<string>>,
	schemaIssues: ReadonlyMap<string, number>,
	{
		dryRun,
		project,
		scannedByRole,
	}: { dryRun: boolean; project: string; scannedByRole: Readonly<Record<string, number>> },
): string {
	const byRole = Object.entries(scannedByRole)
		.map(([role, count]) => `${role}=${count}`)
		.join(', ');
	const issues = [...schemaIssues.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([path, count]) => `    ${path}: ${count}`);
	const sampleLines = [...samples.entries()].map(([name, ids]) => `  ${name}: ${ids.join(', ')}`);

	return [
		`Project: ${project}`,
		dryRun ? 'DRY RUN: nothing was written.' : 'WRITE RUN.',
		`Scanned ${counts.scanned} (${byRole}).`,
		`${dryRun ? 'Would write' : 'Wrote'} ${counts.writes} doc(s): createdAt on ${counts.createdAtSet}, user on ${counts.userSet}` +
			` (of which ${counts.userSetNameless} with no profile found, stored nameless).`,
		`Already current: ${counts.current}.`,
		`Skipped, statement deleted: ${counts.statementDeleted}.`,
		`Skipped, id disagrees with its fields (see scanSubscriptionIdentity): ${counts.idMismatch}.`,
		`createdAt missing and the statement has no usable date: ${counts.noStatementDate}.`,
		`createdAt present but not a number, left alone: ${counts.nonNumberCreatedAt}.`,
		`No top-level statementType, so still not listed in Members: ${counts.noStatementType}.`,
		`Fail StatementSubscriptionSchema (each write logs an ERROR from both triggers): ${counts.schemaInvalid}.`,
		...(issues.length > 0 ? ['  First failing field of those:', ...issues] : []),
		...(sampleLines.length > 0 ? ['Sample doc ids:', ...sampleLines] : []),
	].join('\n');
}

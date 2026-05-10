import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../db';
import {
	Collections,
	Creator,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';

const BACKUP_COLLECTION = 'joinRegistrationBackups';
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Defensive 7-day audit log of every join registration. Two triggers feed
 * the same `joinRegistrationBackups` collection while we stabilize the new
 * sheet sync — if anything corrupts or wipes a submission/membership, the
 * recent state is recoverable here.
 *
 * `expireAt` is a native Firestore Timestamp (not millis) because Firestore
 * TTL only honors Timestamp fields. This is an exception to the project's
 * "milliseconds for everything" convention — see CLAUDE.md.
 *
 * One-time TTL setup (run from a shell with gcloud authenticated):
 *   gcloud firestore fields ttls update expireAt \
 *     --collection-group=joinRegistrationBackups \
 *     --enable-ttl --project=wizcol
 *
 * After enabling, Firestore auto-deletes any doc whose `expireAt` is in
 * the past — typically within 24h of expiry, no scheduled function needed.
 */

function expireAtFromNow(): Timestamp {
	return Timestamp.fromMillis(Date.now() + TTL_MS);
}

/**
 * Snapshots every JoinFormSubmission write (form data, role, optionId).
 * Captures both the before and after document so a restoration knows what
 * the submission looked like at each step.
 */
export const fn_backupJoinFormSubmission = onDocumentWritten(
	{
		document: `${Collections.statements}/{questionId}/${JOIN_FORM_SUBMISSIONS_SUBCOLLECTION}/{userId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const { questionId, userId } = event.params;
		try {
			const before = event.data?.before?.exists ? (event.data.before.data() ?? null) : null;
			const after = event.data?.after?.exists ? (event.data.after.data() ?? null) : null;

			await db.collection(BACKUP_COLLECTION).add({
				type: 'submission',
				questionId,
				userId,
				before,
				after,
				capturedAt: Date.now(),
				expireAt: expireAtFromNow(),
			});
		} catch (error) {
			logger.error('[fn_backupJoinFormSubmission] Failed to write backup', {
				questionId,
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return null;
	},
);

/**
 * Snapshots option-doc membership diffs (joined / organizers added & removed).
 * Each event becomes its own backup row so a restoration can replay them in
 * order — covers form-skipped re-joins and admin resets that don't generate
 * a new submission write.
 */
export const fn_backupOptionMembership = onDocumentWritten(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const { statementId } = event.params;
		try {
			const before = event.data?.before?.exists
				? (event.data.before.data() as Statement | undefined)
				: undefined;
			const after = event.data?.after?.exists
				? (event.data.after.data() as Statement | undefined)
				: undefined;
			const subject = after ?? before;
			if (!subject || subject.statementType !== StatementType.option) {
				return null;
			}
			// Cluster docs and hidden synthesized-cluster members are option-typed
			// but never have a real joined/organizers diff — skip them so a
			// topic/synthesis run doesn't burn this trigger on every cluster doc
			// it produces. `integratedInto` is set by performIntegration on hidden
			// members and is not on the shared Statement type, hence the cast.
			const integratedInto = (subject as { integratedInto?: string }).integratedInto;
			if (subject.isCluster === true || integratedInto) {
				return null;
			}

			const events = computeMembershipEvents(before, after);
			if (events.length === 0) {
				return null;
			}

			const expireAt = expireAtFromNow();
			const capturedAt = Date.now();
			const batch = db.batch();
			for (const ev of events) {
				const ref = db.collection(BACKUP_COLLECTION).doc();
				batch.set(ref, {
					type: 'membership',
					questionId: subject.parentId ?? '',
					optionId: subject.statementId,
					optionTitle: subject.statement ?? '',
					userId: ev.user.uid,
					displayName: ev.user.displayName ?? '',
					action: ev.action,
					role: ev.role,
					capturedAt,
					expireAt,
				});
			}
			await batch.commit();
		} catch (error) {
			logger.error('[fn_backupOptionMembership] Failed to write backup', {
				statementId,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return null;
	},
);

interface MembershipEvent {
	action: 'joined' | 'left';
	role: 'activist' | 'organizer';
	user: Creator;
}

function computeMembershipEvents(
	before: Statement | undefined,
	after: Statement | undefined,
): MembershipEvent[] {
	const events: MembershipEvent[] = [];

	const beforeJoined = toCreatorMap(before?.joined);
	const afterJoined = toCreatorMap(after?.joined);
	for (const [uid, creator] of afterJoined) {
		if (!beforeJoined.has(uid)) {
			events.push({ action: 'joined', role: 'activist', user: creator });
		}
	}
	for (const [uid, creator] of beforeJoined) {
		if (!afterJoined.has(uid)) {
			events.push({ action: 'left', role: 'activist', user: creator });
		}
	}

	const beforeOrgs = toCreatorMap(before?.organizers);
	const afterOrgs = toCreatorMap(after?.organizers);
	for (const [uid, creator] of afterOrgs) {
		if (!beforeOrgs.has(uid)) {
			events.push({ action: 'joined', role: 'organizer', user: creator });
		}
	}
	for (const [uid, creator] of beforeOrgs) {
		if (!afterOrgs.has(uid)) {
			events.push({ action: 'left', role: 'organizer', user: creator });
		}
	}

	return events;
}

function toCreatorMap(arr: Creator[] | undefined): Map<string, Creator> {
	const m = new Map<string, Creator>();
	for (const c of arr ?? []) {
		if (c?.uid) m.set(c.uid, c);
	}

	return m;
}

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { computeMembershipEvents } from './joinSheetMath';
import {
	Collections,
	Creator,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	JOIN_FORM_SUBMISSIONS_HISTORY_COLLECTION,
	JOIN_FORM_SUBMISSIONS_HISTORY_RETENTION_DAYS,
	JoinFormSubmission,
	Statement,
	StatementType,
	functionConfig,
	getJoinFormSubmissionHistoryId,
} from '@freedi/shared-types';

const MEMBERSHIP_BACKUP_COLLECTION = 'joinRegistrationBackups';
const MEMBERSHIP_TTL_DAYS = 7;
const MEMBERSHIP_TTL_MS = MEMBERSHIP_TTL_DAYS * 24 * 60 * 60 * 1000;
const HISTORY_TTL_MS = JOIN_FORM_SUBMISSIONS_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Two backup triggers feed two collections with two purposes:
 *
 *  1. `joinFormSubmissionsHistory` (90d TTL) — durable record of every form
 *     submission write. Full payload (name, phone, email, custom fields) is
 *     captured deterministically on every create / update / delete so a
 *     restore script can rebuild `joinFormSubmissions/{uid}` to any past state.
 *     Default-deny rules; Admin SDK only.
 *
 *  2. `joinRegistrationBackups` (7d TTL) — debugging trace of every option-
 *     membership change (join / leave). Captures `uid` + `displayName` +
 *     option triple, NOT the form payload. Useful for the "what just
 *     happened to user X" support workflow.
 *
 * The form-data backup (1) is the load-bearing record. The membership audit
 * (2) supplements it for activity reconstruction within the past week.
 *
 * `expireAt` is a native Firestore Timestamp (not millis) because Firestore
 * TTL only honors Timestamp fields. This is an exception to the project's
 * "milliseconds for everything" convention — see CLAUDE.md.
 *
 * One-time TTL setup (run from a shell with gcloud authenticated):
 *   gcloud firestore fields ttls update expireAt \
 *     --collection-group=joinRegistrationBackups \
 *     --enable-ttl --project=wizcol-app
 *   gcloud firestore fields ttls update expireAt \
 *     --collection-group=joinFormSubmissionsHistory \
 *     --enable-ttl --project=wizcol-app
 */

function expireMembershipBackup(): Timestamp {
	return Timestamp.fromMillis(Date.now() + MEMBERSHIP_TTL_MS);
}

function expireHistoryEntry(): Timestamp {
	return Timestamp.fromMillis(Date.now() + HISTORY_TTL_MS);
}

/**
 * Reads every option doc under the question and reports which ones the user
 * is currently in (joined / organizers). Used to attach a membership
 * snapshot to each history entry so a restoration knows the user's full
 * Join state at the moment the form was last touched.
 *
 * One Firestore query (parentId == questionId). N option docs in memory —
 * acceptable for typical question sizes (≤100 options); for very large
 * questions consider a maintained denormalized counter, but not yet.
 */
async function readUserMembershipSnapshot(
	questionId: string,
	userId: string,
): Promise<{ activistOptions: string[]; organizerOptions: string[] }> {
	const optionsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();

	const activistOptions: string[] = [];
	const organizerOptions: string[] = [];
	for (const optDoc of optionsSnap.docs) {
		const opt = optDoc.data() as Statement;
		// Skip cluster / integrated members — they don't carry real membership.
		const integratedInto = (opt as { integratedInto?: string }).integratedInto;
		if (opt.isCluster === true || integratedInto) continue;

		if ((opt.joined ?? []).some((c: Creator) => c?.uid === userId)) {
			activistOptions.push(opt.statementId);
		}
		if ((opt.organizers ?? []).some((c: Creator) => c?.uid === userId)) {
			organizerOptions.push(opt.statementId);
		}
	}

	return { activistOptions, organizerOptions };
}

/**
 * Captures every JoinFormSubmission write to the durable history collection.
 * Deterministic doc id (`{qid}_{uid}_{ms}`) + 90-day TTL means the user's
 * full form payload is recoverable for the entire retention window, even if
 * `joinFormSubmissions/{uid}` is wiped by an admin reset or accidental delete.
 */
export const fn_backupJoinFormSubmission = onDocumentWritten(
	{
		document: `${Collections.statements}/{questionId}/${JOIN_FORM_SUBMISSIONS_SUBCOLLECTION}/{userId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const { questionId, userId } = event.params;
		try {
			const before = event.data?.before?.exists
				? (event.data.before.data() as JoinFormSubmission | undefined)
				: undefined;
			const after = event.data?.after?.exists
				? (event.data.after.data() as JoinFormSubmission | undefined)
				: undefined;

			// Determine the operation type. A delete is a write where after is
			// missing — we still capture the last-known state from `before` so
			// a restore can recover the doc that was just deleted.
			let operation: 'create' | 'update' | 'delete';
			if (!before && after) operation = 'create';
			else if (before && !after) operation = 'delete';
			else operation = 'update';

			const snapshotSource = after ?? before;
			if (!snapshotSource) {
				logger.warn('[fn_backupJoinFormSubmission] No before or after data', {
					questionId,
					userId,
				});

				return null;
			}

			const capturedAt = Date.now();
			const historyId = getJoinFormSubmissionHistoryId(questionId, userId, capturedAt);

			// Membership snapshot is best-effort — if the read fails we still
			// write the form-payload entry. Better to have the payload than
			// to lose it because the snapshot read errored.
			let membershipSnapshot: { activistOptions: string[]; organizerOptions: string[] } | undefined;
			try {
				membershipSnapshot = await readUserMembershipSnapshot(questionId, userId);
			} catch (snapErr) {
				logger.warn('[fn_backupJoinFormSubmission] Membership snapshot read failed', {
					questionId,
					userId,
					error: snapErr instanceof Error ? snapErr.message : String(snapErr),
				});
			}

			await db
				.collection(JOIN_FORM_SUBMISSIONS_HISTORY_COLLECTION)
				.doc(historyId)
				.set({
					historyId,
					questionId,
					userId,
					operation,
					capturedAt,
					capturedByTrigger: 'fn_backupJoinFormSubmission',
					displayName: snapshotSource.displayName ?? '',
					values: snapshotSource.values ?? {},
					role: snapshotSource.role ?? null,
					membershipSnapshot: membershipSnapshot ?? null,
					retentionPolicy: 'standard',
					expireAt: expireHistoryEntry(),
				});
		} catch (error) {
			// Trigger MUST NOT throw, otherwise Firestore retries and we'd
			// write duplicate history entries (the doc id includes capturedAt
			// which would be re-minted on retry).
			logError(error, {
				operation: 'joinForm.backupJoinFormSubmission',
				userId,
				statementId: questionId,
			});
		}

		return null;
	},
);

/**
 * Snapshots option-doc membership diffs (joined / organizers added & removed).
 * Each event becomes its own backup row so a restoration can replay them in
 * order — covers form-skipped re-joins and admin resets that don't generate
 * a new submission write. 7-day TTL — debugging trace, not durable backup.
 * The durable backup of form data lives in `joinFormSubmissionsHistory`.
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

			const expireAt = expireMembershipBackup();
			const capturedAt = Date.now();
			const batch = db.batch();
			for (const ev of events) {
				const ref = db.collection(MEMBERSHIP_BACKUP_COLLECTION).doc();
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
			logError(error, {
				operation: 'joinForm.backupOptionMembership',
				statementId,
			});
		}

		return null;
	},
);

// computeMembershipEvents was extracted to ./joinSheetMath so it can be
// unit-tested without Firestore/Sheets I/O.

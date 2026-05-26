import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	JoinFormSubmission,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';
import { appendUserRow, ensureHeaderRow } from './fn_syncOptionMembersToSheet';
import { findUserMembershipsInOptions } from './joinSheetMath';
import { logError } from '../../utils/errorHandling';

/**
 * Closes the "join-before-form" sync drift.
 *
 * Bug class: a user is added to an option's `joined`/`organizers` array
 * BEFORE their `joinFormSubmissions/{uid}` doc exists. Common paths:
 *   - Admin seeds `joined[]` from the main app (no form modal there).
 *   - Cap-swap via `LimitReachedModal` calls `toggleJoining` without first
 *     writing a submission — relies on a pre-existing one.
 *   - Programmatic callers / tests / future features.
 *
 * The existing `fn_syncOptionMembersToSheet` trigger fires on the option-doc
 * write, calls `appendUserRow`, can't find a submission, and returns
 * `skipped-no-submission`. When the user later writes a submission, NO
 * option-doc write happens — so the trigger never re-fires and the sheet row
 * never materializes.
 *
 * This trigger reverses the direction: when a submission lands (or its
 * values change), we re-check every option under the question for that user
 * and call `appendUserRow` for each membership. `appendUserRow` is idempotent
 * (skip-already-present), so already-synced rows are no-ops.
 *
 * IMPORTANT: this trigger does NOT update existing rows when the user
 * changes their form values. That would require an "update-in-place" path,
 * which is out of scope for this fix. Stale values in already-written rows
 * are a separate, lower-priority concern.
 */
export const fn_syncSubmissionToSheet = onDocumentWritten(
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

			// Deletes are handled by the option-doc remove path. The submission
			// disappearing doesn't mean the user un-joined — they may have been
			// reset by an admin while still on an option. Leaving sheet rows in
			// place is the right thing; admin reset has its own cleanup.
			if (!after) return null;

			// Skip lastUpdate-only writes that don't change the form payload.
			// Saves an option-scan + sheet read on every benign metadata refresh.
			if (
				before &&
				JSON.stringify(before.values ?? {}) === JSON.stringify(after.values ?? {}) &&
				before.displayName === after.displayName &&
				before.role === after.role
			) {
				return null;
			}

			const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
			if (!questionSnap.exists) return null;
			const question = questionSnap.data() as Statement;
			const joinForm = question.statementSettings?.joinForm;
			if (!joinForm || joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
				return null;
			}

			const sheetId = extractSheetId(joinForm.sheetUrl);
			if (!sheetId) {
				logger.warn('[fn_syncSubmissionToSheet] Malformed sheet URL', {
					questionId,
					sheetUrl: joinForm.sheetUrl,
				});

				return null;
			}

			const sheets = getGoogleSheetsClient();
			if (!sheets) {
				logger.warn('[fn_syncSubmissionToSheet] GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing');

				return null;
			}

			const optionsSnap = await db
				.collection(Collections.statements)
				.where('parentId', '==', questionId)
				.where('statementType', '==', StatementType.option)
				.get();
			const options: Statement[] = optionsSnap.docs.map((d) => d.data() as Statement);
			const memberships = findUserMembershipsInOptions(options, userId);

			if (memberships.length === 0) {
				// Submission exists but the user isn't on any option (yet). The
				// option-doc trigger will sync them when they actually join.
				logger.info('[fn_syncSubmissionToSheet] No memberships for user, nothing to backfill', {
					questionId,
					userId,
				});

				return null;
			}

			await ensureHeaderRow(sheets, sheetId, joinForm);

			let appended = 0;
			let skippedAlreadyPresent = 0;
			let errors = 0;
			for (const m of memberships) {
				try {
					const result = await appendUserRow({
						sheets,
						sheetId,
						questionId,
						optionId: m.optionId,
						optionTitle: m.optionTitle,
						userId,
						role: m.role,
						joinForm,
					});
					if (result === 'appended') appended++;
					else if (result === 'skipped-already-present') skippedAlreadyPresent++;
					// `skipped-no-submission` can't happen here — the doc that just
					// fired this trigger IS the submission. But if Firestore delivers
					// the trigger before its own commit is readable (extremely
					// unlikely in practice), we'd see it. Logged inside appendUserRow.
				} catch (err) {
					errors++;
					logError(err, {
						operation: 'joinForm.syncSubmissionToSheet.append',
						userId,
						statementId: m.optionId,
						metadata: { questionId, role: m.role },
					});
				}
			}

			logger.info('[fn_syncSubmissionToSheet] Backfill complete', {
				questionId,
				userId,
				memberships: memberships.length,
				appended,
				skippedAlreadyPresent,
				errors,
			});
		} catch (error) {
			// Trigger MUST NOT throw — Firestore would retry and (since
			// appendUserRow is idempotent) the retries would be expensive no-ops
			// at best. Swallow and let the manual reconcile recover from any
			// catastrophic failure.
			logError(error, {
				operation: 'joinForm.syncSubmissionToSheet',
				userId,
				statementId: questionId,
			});
		}

		return null;
	},
);

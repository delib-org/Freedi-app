import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	JoinFormSubmission,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	Statement,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';

/**
 * Appends a newly created join-form submission to the admin-configured
 * Google Sheet, if the owning question has `statementSettings.joinForm.destination`
 * set to `'sheets'`.
 *
 * Idempotency: the function is `onDocumentCreated` so it fires once. On
 * retry, the `syncedToSheet` flag on the submission doc short-circuits the
 * append. Errors are logged but never thrown — failed exports must not
 * trigger exponential retry against the Sheets API.
 */
export const fn_appendJoinSubmissionToSheet = onDocumentCreated(
	`${Collections.statements}/{questionId}/${JOIN_FORM_SUBMISSIONS_SUBCOLLECTION}/{userId}`,
	async (event) => {
		const { questionId, userId } = event.params;

		try {
			const submission = event.data?.data() as JoinFormSubmission | undefined;
			if (!submission) {
				logger.warn('[fn_appendJoinSubmissionToSheet] No submission data', { questionId, userId });

				return null;
			}

			if (submission.syncedToSheet === true) {
				logger.info('[fn_appendJoinSubmissionToSheet] Already synced, skipping', {
					questionId,
					userId,
				});

				return null;
			}

			const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
			if (!questionSnap.exists) {
				logger.warn('[fn_appendJoinSubmissionToSheet] Owning question missing', {
					questionId,
					userId,
				});

				return null;
			}
			const question = questionSnap.data() as Statement;
			const joinForm = question.statementSettings?.joinForm;

			if (!joinForm || joinForm.destination !== 'sheets') {
				// Not a Sheets destination — Firestore is the system of record.
				return null;
			}

			if (!joinForm.sheetUrl) {
				logger.warn('[fn_appendJoinSubmissionToSheet] sheets destination selected but no URL', {
					questionId,
				});

				return null;
			}

			const sheetId = extractSheetId(joinForm.sheetUrl);
			if (!sheetId) {
				logger.warn('[fn_appendJoinSubmissionToSheet] Malformed sheet URL', {
					questionId,
					sheetUrl: joinForm.sheetUrl,
				});

				return null;
			}

			const sheets = getGoogleSheetsClient();
			if (!sheets) {
				logger.warn(
					'[fn_appendJoinSubmissionToSheet] GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing',
				);

				return null;
			}

			// Read the first cell to decide whether we need to write a header row first.
			let isEmpty = false;
			try {
				const headerCheck = await sheets.spreadsheets.values.get({
					spreadsheetId: sheetId,
					range: 'A1',
				});
				isEmpty = !headerCheck.data.values || headerCheck.data.values.length === 0;
			} catch (headError) {
				logger.error('[fn_appendJoinSubmissionToSheet] Header check failed — aborting', {
					questionId,
					error: headError instanceof Error ? headError.message : String(headError),
				});

				return null;
			}

			const fieldIds = joinForm.fields.map((f) => f.id);
			const fieldLabels = joinForm.fields.map((f) => f.label);
			const metadataHeaders = ['userId', 'displayName', 'optionTitle', 'submittedAt', 'questionId'];

			if (isEmpty) {
				try {
					await sheets.spreadsheets.values.append({
						spreadsheetId: sheetId,
						range: 'A1',
						valueInputOption: 'USER_ENTERED',
						requestBody: {
							values: [[...fieldLabels, ...metadataHeaders]],
						},
					});
				} catch (headerError) {
					logger.error('[fn_appendJoinSubmissionToSheet] Header append failed', {
						questionId,
						error: headerError instanceof Error ? headerError.message : String(headerError),
					});

					return null;
				}
			}

			const row = [
				...fieldIds.map((id) => submission.values[id] ?? ''),
				submission.userId,
				submission.displayName,
				'', // optionTitle — the submission is per-question, not tied to a specific option
				new Date(submission.createdAt).toISOString(),
				submission.questionId,
			];

			let updatedRange = '';
			try {
				const appendResult = await sheets.spreadsheets.values.append({
					spreadsheetId: sheetId,
					range: 'A1',
					valueInputOption: 'USER_ENTERED',
					requestBody: { values: [row] },
				});
				updatedRange = appendResult.data.updates?.updatedRange ?? '';
			} catch (appendError) {
				logger.error('[fn_appendJoinSubmissionToSheet] Append failed', {
					questionId,
					userId,
					error: appendError instanceof Error ? appendError.message : String(appendError),
				});

				return null;
			}

			// Mark synced so retries and future re-runs are no-ops.
			try {
				await event.data?.ref.update({
					syncedToSheet: true,
					syncedRange: updatedRange,
					lastUpdate: Date.now(),
				});
			} catch (updateError) {
				logger.warn('[fn_appendJoinSubmissionToSheet] Could not update syncedToSheet flag', {
					questionId,
					userId,
					error: updateError instanceof Error ? updateError.message : String(updateError),
				});
			}

			logger.info('[fn_appendJoinSubmissionToSheet] Appended', {
				questionId,
				userId,
				updatedRange,
			});

			return null;
		} catch (error) {
			logger.error('[fn_appendJoinSubmissionToSheet] Unexpected error', {
				questionId,
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
			// Swallow — never retry via exception on Sheets API side effects.

			return null;
		}
	},
);

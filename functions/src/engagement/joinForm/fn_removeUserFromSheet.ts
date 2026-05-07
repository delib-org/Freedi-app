import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	JoinFormSubmission,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	Statement,
	functionConfig,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';

interface RemoveUserFromSheetRequest {
	questionId: string;
	userId: string;
}

/**
 * Removes a user's row from the Google Sheet when they un-join.
 * Uses the syncedRange from the joinFormSubmission to locate and delete the row.
 *
 * Called directly from the Join app when user clicks un-join, so the sheet
 * is updated immediately without re-opening the form.
 */
export const fn_removeUserFromSheet = onCall(
	{ region: functionConfig.region },
	async (request): Promise<{ success: boolean; message?: string }> => {
		const { questionId, userId } = request.data as RemoveUserFromSheetRequest;

		if (!questionId || !userId) {
			throw new Error('Missing questionId or userId');
		}

		try {
			// Get the question to find the sheet URL
			const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
			if (!questionSnap.exists) {
				logger.warn('[fn_removeUserFromSheet] Question not found', { questionId, userId });
				return { success: false, message: 'Question not found' };
			}

			const question = questionSnap.data() as Statement;
			const joinForm = question.statementSettings?.joinForm;

			// Only process if destination is sheets
			if (!joinForm || joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
				logger.info('[fn_removeUserFromSheet] Not a sheets destination, skipping', {
					questionId,
					userId,
				});
				return { success: true, message: 'Not a sheets destination' };
			}

			// Get the submission to find the synced row
			const submissionSnap = await db
				.collection(Collections.statements)
				.doc(questionId)
				.collection(JOIN_FORM_SUBMISSIONS_SUBCOLLECTION)
				.doc(userId)
				.get();

			if (!submissionSnap.exists) {
				logger.info('[fn_removeUserFromSheet] No submission found', { questionId, userId });
				return { success: true, message: 'No submission found' };
			}

			const submission = submissionSnap.data() as JoinFormSubmission;

			// If never synced to sheet, nothing to remove
			if (!submission.syncedRange || submission.syncedToSheet !== true) {
				logger.info('[fn_removeUserFromSheet] Submission was never synced, skipping', {
					questionId,
					userId,
				});
				return { success: true, message: 'Never synced to sheet' };
			}

			const sheetId = extractSheetId(joinForm.sheetUrl);
			if (!sheetId) {
				logger.warn('[fn_removeUserFromSheet] Malformed sheet URL', {
					questionId,
					sheetUrl: joinForm.sheetUrl,
				});
				return { success: false, message: 'Invalid sheet URL' };
			}

			const sheets = getGoogleSheetsClient();
			if (!sheets) {
				logger.warn('[fn_removeUserFromSheet] GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing');
				return { success: false, message: 'Service account not configured' };
			}

			// Extract row number from syncedRange (format: "Sheet1!A2:G2")
			const rowMatch = submission.syncedRange.match(/!A(\d+)/);
			if (!rowMatch || !rowMatch[1]) {
				logger.warn('[fn_removeUserFromSheet] Could not extract row from syncedRange', {
					questionId,
					userId,
					syncedRange: submission.syncedRange,
				});
				return { success: false, message: 'Invalid syncedRange format' };
			}

			const rowIndex = parseInt(rowMatch[1], 10) - 1; // Google Sheets API uses 0-based indexing

			try {
				// Delete the row using the batchUpdate API
				await sheets.spreadsheets.batchUpdate({
					spreadsheetId: sheetId,
					requestBody: {
						requests: [
							{
								deleteDimension: {
									range: {
										sheetId: 0, // Default sheet
										dimension: 'ROWS',
										startIndex: rowIndex,
										endIndex: rowIndex + 1,
									},
								},
							},
						],
					},
				});

				logger.info('[fn_removeUserFromSheet] User removed from sheet', {
					questionId,
					userId,
					rowIndex,
				});

				return { success: true, message: 'User removed from sheet' };
			} catch (deleteError) {
				logger.error('[fn_removeUserFromSheet] Failed to delete row', {
					questionId,
					userId,
					rowIndex,
					error: deleteError instanceof Error ? deleteError.message : String(deleteError),
				});
				return { success: false, message: 'Failed to delete row from sheet' };
			}
		} catch (error) {
			logger.error('[fn_removeUserFromSheet] Unexpected error', {
				questionId,
				userId,
				error: error instanceof Error ? error.message : String(error),
			});
			return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
		}
	},
);

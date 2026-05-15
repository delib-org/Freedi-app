import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { logError } from '../../utils/errorHandling';

interface RemoveUserFromSheetRequest {
	questionId: string;
	userId: string;
}

interface RemoveUserFromSheetResult {
	success: boolean;
	message: string;
	deletedRow?: number;
}

/**
 * Removes a user's row from the Google Sheet when they un-join.
 *
 * Searches the sheet for the row matching the user's `userId` (rather than
 * relying on a stored `syncedRange`, which becomes stale once any earlier
 * row is deleted). Resolves the actual sheet/tab id from the spreadsheet
 * metadata so the deletion targets the correct tab even when it isn't gid=0.
 */
export const fn_removeUserFromSheet = onCall<
	RemoveUserFromSheetRequest,
	Promise<RemoveUserFromSheetResult>
>({ region: functionConfig.region, cors: [...ALLOWED_ORIGINS] }, async (request) => {
	const { questionId, userId } = request.data;

	logger.info('[fn_removeUserFromSheet] Called', { questionId, userId });

	if (!questionId || !userId) {
		throw new HttpsError('invalid-argument', 'Missing questionId or userId');
	}

	// Step 1: Load the question and verify it has a sheets-destination join form
	const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
	if (!questionSnap.exists) {
		logger.warn('[fn_removeUserFromSheet] Question not found', { questionId });

		return { success: false, message: 'Question not found' };
	}

	const question = questionSnap.data() as Statement;
	const joinForm = question.statementSettings?.joinForm;

	if (!joinForm || joinForm.destination !== 'sheets') {
		logger.info('[fn_removeUserFromSheet] Not a sheets destination — nothing to do', {
			questionId,
			destination: joinForm?.destination,
		});

		return { success: true, message: 'Not a sheets destination' };
	}

	if (!joinForm.sheetUrl) {
		logger.warn('[fn_removeUserFromSheet] sheets destination but no URL configured', {
			questionId,
		});

		return { success: false, message: 'No sheet URL configured' };
	}

	const spreadsheetId = extractSheetId(joinForm.sheetUrl);
	if (!spreadsheetId) {
		logger.warn('[fn_removeUserFromSheet] Could not extract spreadsheet id', {
			sheetUrl: joinForm.sheetUrl,
		});

		return { success: false, message: 'Invalid sheet URL' };
	}

	const sheets = getGoogleSheetsClient();
	if (!sheets) {
		logError(new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing'), {
			operation: 'joinForm.removeUserFromSheet',
			userId,
			statementId: questionId,
		});

		return { success: false, message: 'Service account not configured' };
	}

	try {
		// Step 2: Get the spreadsheet metadata to find the actual sheet (tab) id
		// of the first sheet. The append function writes to the first tab via
		// `range: 'A1'`, so we delete from the same tab here.
		const meta = await sheets.spreadsheets.get({
			spreadsheetId,
			fields: 'sheets(properties(sheetId,title))',
		});
		const firstSheet = meta.data.sheets?.[0]?.properties;
		if (!firstSheet || typeof firstSheet.sheetId !== 'number') {
			logger.error('[fn_removeUserFromSheet] Could not resolve first sheet id', {
				spreadsheetId,
			});

			return { success: false, message: 'Could not resolve sheet id' };
		}

		const sheetTabId = firstSheet.sheetId;
		const sheetTitle = firstSheet.title ?? 'Sheet1';

		logger.info('[fn_removeUserFromSheet] Resolved sheet tab', {
			spreadsheetId,
			sheetTabId,
			sheetTitle,
		});

		// Step 3: Read the entire sheet so we can locate the row by userId.
		// The append function writes the userId into a metadata column whose
		// header is literally "userId" — find that column and scan it.
		const valuesResp = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: `${sheetTitle}!A:ZZ`,
		});
		const rows = valuesResp.data.values ?? [];
		if (rows.length === 0) {
			logger.info('[fn_removeUserFromSheet] Sheet is empty, nothing to remove', {
				spreadsheetId,
			});

			return { success: true, message: 'Sheet is empty' };
		}

		const headerRow = rows[0] ?? [];
		const userIdColumn = headerRow.findIndex(
			(cell) => typeof cell === 'string' && cell.trim() === 'userId',
		);
		if (userIdColumn === -1) {
			logger.warn('[fn_removeUserFromSheet] No "userId" column found in header', {
				spreadsheetId,
				headers: headerRow,
			});

			return { success: false, message: 'No userId column in sheet' };
		}

		// Step 4: Find the row matching this userId. Skip header (row 0). We
		// match the most recent occurrence so admins inspecting the sheet see
		// the latest copy disappear.
		let targetRowIndex = -1;
		for (let i = rows.length - 1; i >= 1; i--) {
			const row = rows[i];
			const cell = row?.[userIdColumn];
			if (typeof cell === 'string' && cell === userId) {
				targetRowIndex = i;
				break;
			}
		}

		if (targetRowIndex === -1) {
			logger.info('[fn_removeUserFromSheet] User not found in sheet — already removed?', {
				spreadsheetId,
				userId,
			});

			return { success: true, message: 'User not found in sheet (already removed?)' };
		}

		logger.info('[fn_removeUserFromSheet] Deleting row', {
			spreadsheetId,
			userId,
			targetRowIndex,
			rowNumberInSheet: targetRowIndex + 1,
		});

		// Step 5: Delete the row using batchUpdate. `startIndex` is 0-based and
		// inclusive; `endIndex` is exclusive. So to delete just one row we use
		// [targetRowIndex, targetRowIndex + 1).
		await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						deleteDimension: {
							range: {
								sheetId: sheetTabId,
								dimension: 'ROWS',
								startIndex: targetRowIndex,
								endIndex: targetRowIndex + 1,
							},
						},
					},
				],
			},
		});

		logger.info('[fn_removeUserFromSheet] Row deleted successfully', {
			spreadsheetId,
			userId,
			deletedRow: targetRowIndex + 1,
		});

		return {
			success: true,
			message: 'Row deleted',
			deletedRow: targetRowIndex + 1,
		};
	} catch (error) {
		logError(error, {
			operation: 'joinForm.removeUserFromSheet',
			userId,
			statementId: questionId,
			metadata: { spreadsheetId },
		});

		return {
			success: false,
			message: error instanceof Error ? error.message : 'Sheets API error',
		};
	}
});

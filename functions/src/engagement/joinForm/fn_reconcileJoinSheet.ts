import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	Creator,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';
import {
	appendUserRow,
	ensureHeaderRow,
	migrateV1ToV2IfNeeded,
	readSheetSchemaVersion,
	CURRENT_SHEET_SCHEMA_VERSION,
	type Role as MemberRole,
} from './fn_syncOptionMembersToSheet';
import { buildLiveMemberKeys, findOrphanRowIndices } from './joinSheetMath';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { assertJoinAdminAuthorized } from '../../utils/joinAuth';
import { logError } from '../../utils/errorHandling';

interface ReconcileRequest {
	questionId: string;
}

interface ReconcileResult {
	success: boolean;
	questionId: string;
	optionsScanned: number;
	totalMembers: number;
	appended: number;
	skippedAlreadyPresent: number;
	skippedNoSubmission: number;
	removed: number;
	/**
	 * True when the sheet predates the current schema (v1 — no `optionId`
	 * column) and orphan-removal was therefore skipped. v1 sheets match
	 * rows by option title, which is ambiguous if titles were renamed —
	 * removing under that ambiguity risks deleting valid rows. The UI uses
	 * this flag to tell the admin to migrate (or to indicate that running
	 * the trigger again will migrate on the next member change).
	 */
	orphanRemovalSkippedV1: boolean;
	errors: number;
	message: string;
}

/**
 * Backfills the Google Sheet for a question by walking every option's
 * `joined` and `organizers` arrays and appending any missing rows. Driven
 * by user complaints (Dalia, 2026-05-10) that members who joined two
 * options before `fn_syncOptionMembersToSheet` was deployed only show up
 * in the sheet once — those joins never produced an option-doc write under
 * the new trigger, so the sheet has stale data.
 *
 * Idempotent: relies on the same `findRowIndex` guard inside `appendUserRow`,
 * so running this multiple times on the same question never duplicates a row.
 *
 * Auth: caller must be the question's creator, or hold an admin/creator
 * subscription, or be a JoinDelegate with `canManageOrganizerSolutions`.
 * Same authorization shape as `fn_createOrganizerSuggestion` — these are the
 * roles already trusted to mutate the question's join state.
 */
export const fn_reconcileJoinSheet = onCall<ReconcileRequest, Promise<ReconcileResult>>(
	{ region: functionConfig.region, cors: [...ALLOWED_ORIGINS] },
	async (request: CallableRequest<ReconcileRequest>) => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { questionId } = request.data ?? {};
		if (!questionId || typeof questionId !== 'string') {
			throw new HttpsError('invalid-argument', 'questionId is required');
		}

		const { question } = await assertJoinAdminAuthorized({
			uid,
			questionId,
			operation: 'joinForm.reconcileSheet',
		});

		const joinForm = question.statementSettings?.joinForm;
		if (!joinForm || joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
			throw new HttpsError(
				'failed-precondition',
				'Question is not configured with a Google Sheets destination',
			);
		}

		const sheetId = extractSheetId(joinForm.sheetUrl);
		if (!sheetId) {
			throw new HttpsError('failed-precondition', 'Sheet URL is malformed');
		}

		const sheets = getGoogleSheetsClient();
		if (!sheets) {
			throw new HttpsError(
				'failed-precondition',
				'GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing',
			);
		}

		// Make sure a header exists before we start appending — fresh sheets
		// otherwise get the form-field labels written as data into A1.
		await ensureHeaderRow(sheets, sheetId, joinForm);

		// Eagerly run the v1→v2 migration if the sheet is legacy. Without this
		// the admin would have to wait for natural join/leave activity before
		// the orphan-removal pass below could safely run (it's gated on v2).
		// Failure is non-fatal — falls through to the v1-skipped path below.
		try {
			const preMigrationVersion = await readSheetSchemaVersion(sheets, sheetId);
			if (preMigrationVersion < CURRENT_SHEET_SCHEMA_VERSION) {
				await migrateV1ToV2IfNeeded(sheets, sheetId, questionId);
			}
		} catch (err) {
			logError(err, {
				operation: 'joinForm.reconcileSheet.migrateV1ToV2',
				statementId: questionId,
				metadata: { questionId },
			});
		}

		// Pull every option for this question. We scan child docs by parentId
		// (rather than relying on the question's own subStatements list, which
		// can be stale or partial) and skip cluster/integrated members the
		// same way the trigger does.
		const optionsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		let optionsScanned = 0;
		let totalMembers = 0;
		let appended = 0;
		let skippedAlreadyPresent = 0;
		let skippedNoSubmission = 0;
		let removed = 0;
		let errors = 0;

		// Track the live membership tuples as we scan. We need this for the
		// orphan-removal pass anyway, and computing it here saves a second walk.
		const liveMembershipsForOrphanCheck: Array<{
			userId: string;
			role: MemberRole;
			optionId: string;
			optionTitle: string;
		}> = [];

		for (const optDoc of optionsSnap.docs) {
			const option = optDoc.data() as Statement;
			const integratedInto = (option as { integratedInto?: string }).integratedInto;
			if (option.isCluster === true || integratedInto) continue;
			optionsScanned++;

			const memberships: Array<{ creator: Creator; role: MemberRole }> = [
				...(option.joined ?? []).map((c) => ({ creator: c, role: 'activist' as MemberRole })),
				...(option.organizers ?? []).map((c) => ({ creator: c, role: 'organizer' as MemberRole })),
			].filter((m) => m.creator?.uid);

			for (const { creator, role } of memberships) {
				totalMembers++;
				liveMembershipsForOrphanCheck.push({
					userId: creator.uid,
					role,
					optionId: option.statementId,
					optionTitle: option.statement ?? '',
				});
				try {
					const result = await appendUserRow({
						sheets,
						sheetId,
						questionId,
						optionId: option.statementId,
						optionTitle: option.statement ?? '',
						userId: creator.uid,
						role,
						joinForm,
					});
					if (result === 'appended') appended++;
					else if (result === 'skipped-already-present') skippedAlreadyPresent++;
					else if (result === 'skipped-no-submission') skippedNoSubmission++;
				} catch (err) {
					errors++;
					logError(err, {
						operation: 'joinForm.reconcileSheet.append',
						userId: creator.uid,
						statementId: option.statementId,
						metadata: { questionId, role },
					});
				}
			}
		}

		// --- Orphan removal pass ---------------------------------------------
		// Gated on v2 schema: on v1 sheets we'd match orphans by title only,
		// which deletes valid rows whenever an option title was renamed after
		// some users joined. The v1→v2 migration eliminates this risk; until
		// then we err on the side of leaving stale rows in place.
		let orphanRemovalSkippedV1 = false;
		try {
			const schemaVersion = await readSheetSchemaVersion(sheets, sheetId);
			if (schemaVersion < CURRENT_SHEET_SCHEMA_VERSION) {
				orphanRemovalSkippedV1 = true;
				logger.warn(
					'[fn_reconcileJoinSheet] Skipping orphan removal — sheet is v1 (legacy). Migrate to v2 to enable orphan cleanup.',
					{ questionId, schemaVersion },
				);
			} else {
				removed = await removeOrphanRows({
					sheets,
					sheetId,
					liveMemberKeys: buildLiveMemberKeys(liveMembershipsForOrphanCheck),
					questionId,
				});
			}
		} catch (err) {
			errors++;
			logError(err, {
				operation: 'joinForm.reconcileSheet.removeOrphans',
				statementId: questionId,
				metadata: { questionId },
			});
		}

		const message =
			`Scanned ${optionsScanned} options / ${totalMembers} members → ` +
			`${appended} appended, ${skippedAlreadyPresent} already present, ` +
			`${skippedNoSubmission} without submission, ${removed} orphan(s) removed, ` +
			`${errors} errors` +
			(orphanRemovalSkippedV1 ? ' (orphan removal skipped — v1 sheet)' : '');
		logger.info('[fn_reconcileJoinSheet] Done', {
			questionId,
			optionsScanned,
			totalMembers,
			appended,
			skippedAlreadyPresent,
			skippedNoSubmission,
			removed,
			orphanRemovalSkippedV1,
			errors,
		});

		return {
			success: errors === 0,
			questionId,
			optionsScanned,
			totalMembers,
			appended,
			skippedAlreadyPresent,
			skippedNoSubmission,
			removed,
			orphanRemovalSkippedV1,
			errors,
			message,
		};
	},
);

interface RemoveOrphansArgs {
	sheets: ReturnType<typeof getGoogleSheetsClient>;
	sheetId: string;
	liveMemberKeys: Set<string>;
	questionId: string;
}

/**
 * Reads the sheet, finds rows whose (userId, role, option) tuple doesn't
 * match any live membership, and deletes them in a single batchUpdate.
 *
 * Deletes are sorted DESCENDING by row index so each `deleteDimension`
 * request operates on indices that are still valid relative to the
 * pre-batch state. Sheets API processes requests in order; after each
 * delete, subsequent indices in the same batch refer to the post-delete
 * state — descending order keeps them aligned.
 *
 * Returns the number of rows deleted.
 */
async function removeOrphanRows(args: RemoveOrphansArgs): Promise<number> {
	const { sheets, sheetId, liveMemberKeys, questionId } = args;
	if (!sheets) return 0;

	const meta = await sheets.spreadsheets.get({
		spreadsheetId: sheetId,
		fields: 'sheets(properties(sheetId,title))',
	});
	const firstSheet = meta.data.sheets?.[0]?.properties;
	if (!firstSheet || typeof firstSheet.sheetId !== 'number') return 0;
	const sheetTabId = firstSheet.sheetId;
	const sheetTitle = firstSheet.title ?? 'Sheet1';

	const resp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rawRows = resp.data.values ?? [];
	const rows: string[][] = rawRows.map((r) =>
		(r ?? []).map((c) => (typeof c === 'string' ? c : String(c ?? ''))),
	);

	const orphans = findOrphanRowIndices(rows, liveMemberKeys);
	if (orphans.length === 0) return 0;

	// Descending so each delete leaves earlier indices valid.
	const sorted = [...orphans].sort((a, b) => b - a);
	await sheets.spreadsheets.batchUpdate({
		spreadsheetId: sheetId,
		requestBody: {
			requests: sorted.map((rowIndex) => ({
				deleteDimension: {
					range: {
						sheetId: sheetTabId,
						dimension: 'ROWS',
						startIndex: rowIndex,
						endIndex: rowIndex + 1,
					},
				},
			})),
		},
	});

	logger.info('[fn_reconcileJoinSheet] Removed orphan rows', {
		questionId,
		count: orphans.length,
	});

	return orphans.length;
}

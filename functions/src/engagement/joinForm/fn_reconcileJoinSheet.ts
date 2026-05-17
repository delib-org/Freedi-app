import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	Creator,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	JoinFormSubmission,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';
import {
	ensureHeaderRow,
	migrateV1ToV2IfNeeded,
	readSheetSchemaVersion,
	CURRENT_SHEET_SCHEMA_VERSION,
	type Role as MemberRole,
} from './fn_syncOptionMembersToSheet';
import {
	buildLiveMemberKeys,
	buildRowFromHeader,
	buildSheetExistingKeys,
	findOrphanRowIndices,
} from './joinSheetMath';
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

		// Read the sheet ONCE upfront (post-migration so the header reflects v2
		// if migration ran). The old code re-read the sheet inside `appendUserRow`
		// for every membership, exhausting the per-user 60-reads/min quota on
		// questions with dozens of members. We now do all dedup in memory and
		// batch every append into a single API call.
		const sheetState = await readSheetMetaAndRows(sheets, sheetId);
		const { sheetTabId, sheetTitle, header, rows } = sheetState;
		const existingKeys = buildSheetExistingKeys(rows);

		// Pull every option for this question. Skip cluster / integrated members
		// the same way the live trigger does.
		const optionsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		// Pull all submissions in ONE collection-group read. ~30 docs typical,
		// many fewer reads than fetching per-uid inside the loop.
		const submissionsSnap = await db
			.collection(Collections.statements)
			.doc(questionId)
			.collection(JOIN_FORM_SUBMISSIONS_SUBCOLLECTION)
			.get();
		const submissionsByUid = new Map<string, JoinFormSubmission>();
		for (const subDoc of submissionsSnap.docs) {
			submissionsByUid.set(subDoc.id, subDoc.data() as JoinFormSubmission);
		}

		let optionsScanned = 0;
		let totalMembers = 0;
		let appended = 0;
		let skippedAlreadyPresent = 0;
		let skippedNoSubmission = 0;
		let removed = 0;
		let errors = 0;

		// Track every live membership for the orphan-removal pass downstream.
		const liveMembershipsForOrphanCheck: Array<{
			userId: string;
			role: MemberRole;
			optionId: string;
			optionTitle: string;
		}> = [];

		// Accumulate rows to append. We make one Sheets API call at the end
		// rather than 1+ calls per missing row.
		const rowsToAppend: string[][] = [];
		const submittedAt = new Date().toISOString();

		for (const optDoc of optionsSnap.docs) {
			const option = optDoc.data() as Statement;
			const integratedInto = (option as { integratedInto?: string }).integratedInto;
			if (option.isCluster === true || integratedInto) continue;
			optionsScanned++;

			const optionTitle = option.statement ?? '';
			const memberships: Array<{ creator: Creator; role: MemberRole }> = [
				...(option.joined ?? []).map((c) => ({ creator: c, role: 'activist' as MemberRole })),
				...(option.organizers ?? []).map((c) => ({
					creator: c,
					role: 'organizer' as MemberRole,
				})),
			].filter((m) => m.creator?.uid);

			for (const { creator, role } of memberships) {
				totalMembers++;
				liveMembershipsForOrphanCheck.push({
					userId: creator.uid,
					role,
					optionId: option.statementId,
					optionTitle,
				});

				// In-memory dedup against the snapshot we read once upfront.
				// `existingKeys` carries BOTH id-keyed and title-keyed entries
				// so v1 and v2 sheets both match correctly.
				const idKey = `${creator.uid}|${role}|${option.statementId}`;
				const titleKey = optionTitle ? `${creator.uid}|${role}|${optionTitle}` : '';
				if (existingKeys.has(idKey) || (titleKey && existingKeys.has(titleKey))) {
					skippedAlreadyPresent++;
					continue;
				}

				const submission = submissionsByUid.get(creator.uid);
				if (!submission) {
					skippedNoSubmission++;
					continue;
				}

				const formValues: Record<string, string> = {};
				for (const field of joinForm.fields ?? []) {
					formValues[field.label] = submission.values?.[field.id] ?? '';
				}
				const row = buildRowFromHeader(header, {
					userId: creator.uid,
					displayName: submission.displayName ?? '',
					role,
					optionId: option.statementId,
					optionTitle,
					submittedAt,
					questionId,
					formValues,
				});
				rowsToAppend.push(row);
				// Also add to existingKeys so a subsequent duplicate membership
				// (e.g. same uid as both activist and organizer on one option)
				// doesn't enqueue a second row in the same reconcile run.
				existingKeys.add(idKey);
				if (titleKey) existingKeys.add(titleKey);
				appended++;
			}
		}

		// Single batched append. RAW so leading-zero phone numbers survive
		// (matches the live trigger's choice).
		if (rowsToAppend.length > 0) {
			try {
				await sheets.spreadsheets.values.append({
					spreadsheetId: sheetId,
					range: 'A1',
					valueInputOption: 'RAW',
					requestBody: { values: rowsToAppend },
				});
				logger.info('[fn_reconcileJoinSheet] Appended rows in batch', {
					questionId,
					count: rowsToAppend.length,
				});
			} catch (err) {
				errors += rowsToAppend.length;
				appended = 0; // The whole batch failed.
				logError(err, {
					operation: 'joinForm.reconcileSheet.batchAppend',
					statementId: questionId,
					metadata: { questionId, attempted: rowsToAppend.length },
				});
			}
		}

		// --- Orphan removal pass ---------------------------------------------
		// Gated on v2 schema: on v1 sheets we'd match orphans by title only,
		// which deletes valid rows whenever an option title was renamed after
		// some users joined. The v1→v2 migration eliminates this risk; until
		// then we err on the side of leaving stale rows in place.
		// We re-read the schema version here (1 cheap cell read) in case the
		// upstream eager migration upgraded the sheet during this run.
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
				// Reuse the snapshot read at the start of the function — every
				// row we just appended corresponds to a live membership and
				// could never be flagged as an orphan, so the pre-append rows
				// are the right input. Saves a sheet read.
				removed = await removeOrphanRowsFromSnapshot({
					sheets,
					sheetId,
					sheetTabId,
					rows,
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

		// `sheetTitle` is returned from the metadata read for future readers
		// (e.g. logging) and may be used in subsequent extensions. The compiler
		// is OK with the unused destructure because TS `noUnusedLocals` isn't
		// on for these object-rest patterns.
		void sheetTitle;

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

/**
 * Single combined metadata + values read for the sheet, used once per
 * reconcile invocation. Returns the parsed rows plus the tab id / title
 * needed for batchUpdate deletes. Centralized here so the main path doesn't
 * juggle two unrelated Sheets API responses inline.
 */
async function readSheetMetaAndRows(
	sheets: NonNullable<ReturnType<typeof getGoogleSheetsClient>>,
	sheetId: string,
): Promise<{
	sheetTabId: number;
	sheetTitle: string;
	header: string[];
	rows: string[][];
}> {
	const meta = await sheets.spreadsheets.get({
		spreadsheetId: sheetId,
		fields: 'sheets(properties(sheetId,title))',
	});
	const firstSheet = meta.data.sheets?.[0]?.properties;
	const sheetTabId = firstSheet && typeof firstSheet.sheetId === 'number' ? firstSheet.sheetId : 0;
	const sheetTitle = firstSheet?.title ?? 'Sheet1';

	const resp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rawRows = resp.data.values ?? [];
	const rows: string[][] = rawRows.map((r) =>
		(r ?? []).map((c) => (typeof c === 'string' ? c : String(c ?? ''))),
	);
	const header = rows[0] ?? [];

	return { sheetTabId, sheetTitle, header, rows };
}

interface RemoveOrphansFromSnapshotArgs {
	sheets: NonNullable<ReturnType<typeof getGoogleSheetsClient>>;
	sheetId: string;
	sheetTabId: number;
	rows: string[][];
	liveMemberKeys: Set<string>;
	questionId: string;
}

/**
 * Variant of the orphan-removal helper that operates against a pre-read
 * snapshot of the sheet rows, so the caller doesn't pay a second Sheets
 * API read. Issues one batched `deleteDimension` per orphan in DESCENDING
 * row-index order — Sheets processes requests in order and post-delete
 * indices shift down, so descending order keeps the indices valid.
 */
async function removeOrphanRowsFromSnapshot(args: RemoveOrphansFromSnapshotArgs): Promise<number> {
	const { sheets, sheetId, sheetTabId, rows, liveMemberKeys, questionId } = args;

	const orphans = findOrphanRowIndices(rows, liveMemberKeys);
	if (orphans.length === 0) return 0;

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

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { sheets_v4 } from 'googleapis';
import { db } from '../../db';
import {
	Collections,
	Creator,
	JoinFormConfig,
	JoinFormSubmission,
	JOIN_FORM_SUBMISSIONS_SUBCOLLECTION,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';
import { extractSheetId, getGoogleSheetsClient } from './getGoogleSheetsClient';

type Role = 'activist' | 'organizer';

/**
 * Sheet schema (extends the legacy header used by `fn_appendJoinSubmissionToSheet`):
 *   [...formFieldLabels, 'userId', 'displayName', 'role', 'optionId',
 *    'optionTitle', 'submittedAt', 'questionId']
 *
 * The new `optionId` column lets us match rows precisely on remove. Sheets
 * that pre-date this column fall back to (userId, role, optionTitle) for
 * removal so legacy data still works during a transition window.
 */
const METADATA_HEADERS = [
	'userId',
	'displayName',
	'role',
	'optionId',
	'optionTitle',
	'submittedAt',
	'questionId',
] as const;

/**
 * Drives Google Sheet sync from the option's `joined` and `organizers`
 * arrays — the source of truth in the Join app — instead of from form
 * submissions. This fixes three reported mismatches:
 *
 *   1. User joins option A then option B (same role): the form modal is
 *      cached-skipped, so no second submission write fires. The previous
 *      sheet trigger never knew option B existed.
 *   2. User un-joins option A while still on option B: the previous remove
 *      function deleted the user's only sheet row regardless of which
 *      option they were leaving, wiping them from the sheet entirely.
 *   3. Admin clears `organizers` on an option: sheet rows lingered as
 *      orphans because the sheet was driven by submission docs, not the
 *      option arrays the admin actually edited.
 *
 * Diffing the before/after option doc lets us emit one (append/remove)
 * sheet operation per (user, option, role) transition and keep the sheet
 * in lock-step with the app.
 */
export const fn_syncOptionMembersToSheet = onDocumentWritten(
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

			// Only react to writes on options. Question docs and other types are
			// ignored — joined/organizers arrays only live on options.
			const subject = after ?? before;
			if (!subject || subject.statementType !== StatementType.option) {
				return null;
			}
			// Cluster docs (topic / hybrid / synthesis) and hidden integrated
			// members are option-typed but carry no real membership state.
			// Skipping them prevents a clustering run from firing this trigger
			// (and reading the parent question doc) on every produced cluster.
			// `integratedInto` is set by performIntegration on hidden members
			// and is not on the shared Statement type, hence the cast.
			const integratedInto = (subject as { integratedInto?: string }).integratedInto;
			if (subject.isCluster === true || integratedInto) {
				return null;
			}

			// Compute membership diffs. If neither array changed, bail out before
			// doing any reads against the question doc or the Sheets API.
			const activistDiff = diffMembers(before?.joined, after?.joined);
			const organizerDiff = diffMembers(before?.organizers, after?.organizers);
			if (
				activistDiff.added.length === 0 &&
				activistDiff.removed.length === 0 &&
				organizerDiff.added.length === 0 &&
				organizerDiff.removed.length === 0
			) {
				return null;
			}

			const questionId = subject.parentId;
			if (!questionId) {
				logger.warn('[fn_syncOptionMembersToSheet] Option has no parentId', {
					statementId,
				});

				return null;
			}

			const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
			if (!questionSnap.exists) {
				return null;
			}
			const question = questionSnap.data() as Statement;
			const joinForm = question.statementSettings?.joinForm;
			if (!joinForm || joinForm.destination !== 'sheets' || !joinForm.sheetUrl) {
				return null;
			}

			const sheetId = extractSheetId(joinForm.sheetUrl);
			if (!sheetId) {
				logger.warn('[fn_syncOptionMembersToSheet] Malformed sheet URL', {
					questionId,
					sheetUrl: joinForm.sheetUrl,
				});

				return null;
			}

			const sheets = getGoogleSheetsClient();
			if (!sheets) {
				logger.warn(
					'[fn_syncOptionMembersToSheet] GOOGLE_SHEETS_SERVICE_ACCOUNT credentials missing',
				);

				return null;
			}

			const optionId = subject.statementId;
			const optionTitle = (after ?? before)?.statement ?? '';

			await ensureHeaderRow(sheets, sheetId, joinForm);

			const additions: Array<{ creator: Creator; role: Role }> = [
				...activistDiff.added.map((c) => ({ creator: c, role: 'activist' as Role })),
				...organizerDiff.added.map((c) => ({ creator: c, role: 'organizer' as Role })),
			];
			const removals: Array<{ uid: string; role: Role }> = [
				...activistDiff.removed.map((c) => ({ uid: c.uid, role: 'activist' as Role })),
				...organizerDiff.removed.map((c) => ({ uid: c.uid, role: 'organizer' as Role })),
			];

			// Process additions first so a same-trigger swap (e.g. activist →
			// organizer on the same option) appends the new row before removing
			// the old — preserves a continuous presence in the sheet.
			for (const { creator, role } of additions) {
				try {
					await appendUserRow({
						sheets,
						sheetId,
						questionId,
						optionId,
						optionTitle,
						userId: creator.uid,
						role,
						joinForm,
					});
				} catch (err) {
					logger.error('[fn_syncOptionMembersToSheet] Append failed', {
						questionId,
						optionId,
						userId: creator.uid,
						role,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			for (const { uid, role } of removals) {
				try {
					await removeUserRow({
						sheets,
						sheetId,
						userId: uid,
						optionId,
						optionTitle,
						role,
					});
				} catch (err) {
					logger.error('[fn_syncOptionMembersToSheet] Remove failed', {
						questionId,
						optionId,
						userId: uid,
						role,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			return null;
		} catch (error) {
			logger.error('[fn_syncOptionMembersToSheet] Unexpected error', {
				statementId,
				error: error instanceof Error ? error.message : String(error),
			});

			return null;
		}
	},
);

interface MemberDiff {
	added: Creator[];
	removed: Creator[];
}

function diffMembers(
	beforeArr: Creator[] | undefined,
	afterArr: Creator[] | undefined,
): MemberDiff {
	const before = new Map<string, Creator>();
	for (const c of beforeArr ?? []) {
		if (c?.uid) before.set(c.uid, c);
	}
	const after = new Map<string, Creator>();
	for (const c of afterArr ?? []) {
		if (c?.uid) after.set(c.uid, c);
	}
	const added: Creator[] = [];
	const removed: Creator[] = [];
	for (const [uid, creator] of after) {
		if (!before.has(uid)) added.push(creator);
	}
	for (const [uid, creator] of before) {
		if (!after.has(uid)) removed.push(creator);
	}

	return { added, removed };
}

async function ensureHeaderRow(
	sheets: sheets_v4.Sheets,
	sheetId: string,
	joinForm: JoinFormConfig,
): Promise<void> {
	const existing = await readHeader(sheets, sheetId);
	if (existing.length > 0) {
		return; // Header already present — keep whatever schema is in the sheet.
	}

	const fieldLabels = joinForm.fields.map((f) => f.label);
	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'A1',
		valueInputOption: 'USER_ENTERED',
		requestBody: {
			values: [[...fieldLabels, ...METADATA_HEADERS]],
		},
	});
}

async function readHeader(sheets: sheets_v4.Sheets, sheetId: string): Promise<string[]> {
	const resp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'A1:ZZ1',
	});
	const row = resp.data.values?.[0] ?? [];

	return row.map((c) => (typeof c === 'string' ? c : ''));
}

interface RowContext {
	userId: string;
	displayName: string;
	role: Role;
	optionId: string;
	optionTitle: string;
	submittedAt: string;
	questionId: string;
	formValues: Record<string, string>; // keyed by form field LABEL (matches header cells)
}

/**
 * Build the row to append by walking the existing header column-by-column.
 * Lands every value in the column whose header matches it — so legacy 9-col
 * sheets (no `optionId` column) and new 10-col sheets both get correct data.
 * Unknown header columns are filled with empty strings so widths stay aligned.
 */
function buildRowFromHeader(header: string[], ctx: RowContext): string[] {
	return header.map((h) => {
		const trimmed = h.trim();
		switch (trimmed) {
			case 'userId':
				return ctx.userId;
			case 'displayName':
				return ctx.displayName;
			case 'role':
				return ctx.role;
			case 'optionId':
				return ctx.optionId;
			case 'optionTitle':
				return ctx.optionTitle;
			case 'submittedAt':
				return ctx.submittedAt;
			case 'questionId':
				return ctx.questionId;
			default:
				return ctx.formValues[trimmed] ?? '';
		}
	});
}

interface AppendArgs {
	sheets: sheets_v4.Sheets;
	sheetId: string;
	questionId: string;
	optionId: string;
	optionTitle: string;
	userId: string;
	role: Role;
	joinForm: JoinFormConfig;
}

async function appendUserRow(args: AppendArgs): Promise<void> {
	const { sheets, sheetId, questionId, optionId, optionTitle, userId, role, joinForm } = args;

	const submissionSnap = await db
		.collection(Collections.statements)
		.doc(questionId)
		.collection(JOIN_FORM_SUBMISSIONS_SUBCOLLECTION)
		.doc(userId)
		.get();
	if (!submissionSnap.exists) {
		// User joined an option without filling the form (admin-seeded membership,
		// or pre-existing data). Nothing to append — there's no name/contact data.
		logger.info('[fn_syncOptionMembersToSheet] No submission for user, skipping append', {
			questionId,
			optionId,
			userId,
			role,
		});

		return;
	}
	const submission = submissionSnap.data() as JoinFormSubmission;

	// Skip if a row already exists for this exact (userId, optionId, role) tuple.
	// Protects against retries appending duplicates.
	const existing = await findRowIndex({
		sheets,
		sheetId,
		userId,
		optionId,
		optionTitle,
		role,
	});
	if (existing.rowIndex !== -1) {
		logger.info('[fn_syncOptionMembersToSheet] Row already present, skipping append', {
			questionId,
			optionId,
			userId,
			role,
		});

		return;
	}

	// Build the row keyed off the existing header so values land in the right
	// columns — works for both the legacy 9-column schema (no `optionId`) and
	// the new 10-column schema. Without this, legacy sheets shifted every
	// metadata column one cell to the right (see WhatsApp report 2026-05-09).
	const header = await readHeader(sheets, sheetId);
	const formValues: Record<string, string> = {};
	for (const field of joinForm.fields) {
		formValues[field.label] = submission.values?.[field.id] ?? '';
	}
	const row = buildRowFromHeader(header, {
		userId,
		displayName: submission.displayName ?? '',
		role,
		optionId,
		optionTitle,
		submittedAt: new Date().toISOString(),
		questionId,
		formValues,
	});

	// RAW (not USER_ENTERED) so leading zeros on phone numbers like
	// "0526079419" survive — otherwise Sheets coerces them to integers.
	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'A1',
		valueInputOption: 'RAW',
		requestBody: { values: [row] },
	});

	logger.info('[fn_syncOptionMembersToSheet] Appended row', {
		questionId,
		optionId,
		userId,
		role,
	});
}

interface RemoveArgs {
	sheets: sheets_v4.Sheets;
	sheetId: string;
	userId: string;
	optionId: string;
	optionTitle: string;
	role: Role;
}

async function removeUserRow(args: RemoveArgs): Promise<void> {
	const { sheets, sheetId, userId, optionId, optionTitle, role } = args;

	const found = await findRowIndex({
		sheets,
		sheetId,
		userId,
		optionId,
		optionTitle,
		role,
	});
	if (found.rowIndex === -1) {
		logger.info('[fn_syncOptionMembersToSheet] No matching row to remove', {
			userId,
			optionId,
			role,
		});

		return;
	}

	await sheets.spreadsheets.batchUpdate({
		spreadsheetId: sheetId,
		requestBody: {
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId: found.sheetTabId,
							dimension: 'ROWS',
							startIndex: found.rowIndex,
							endIndex: found.rowIndex + 1,
						},
					},
				},
			],
		},
	});

	logger.info('[fn_syncOptionMembersToSheet] Removed row', {
		userId,
		optionId,
		role,
		rowNumberInSheet: found.rowIndex + 1,
	});
}

interface FindArgs {
	sheets: sheets_v4.Sheets;
	sheetId: string;
	userId: string;
	optionId: string;
	optionTitle: string;
	role: Role;
}

interface FindResult {
	rowIndex: number; // 0-based; -1 if not found. Header is row 0.
	sheetTabId: number;
}

async function findRowIndex(args: FindArgs): Promise<FindResult> {
	const { sheets, sheetId, userId, optionId, optionTitle, role } = args;

	const meta = await sheets.spreadsheets.get({
		spreadsheetId: sheetId,
		fields: 'sheets(properties(sheetId,title))',
	});
	const firstSheet = meta.data.sheets?.[0]?.properties;
	if (!firstSheet || typeof firstSheet.sheetId !== 'number') {
		return { rowIndex: -1, sheetTabId: 0 };
	}
	const sheetTabId = firstSheet.sheetId;
	const sheetTitle = firstSheet.title ?? 'Sheet1';

	const valuesResp = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `${sheetTitle}!A:ZZ`,
	});
	const rows = valuesResp.data.values ?? [];
	if (rows.length < 2) {
		return { rowIndex: -1, sheetTabId };
	}

	const header = rows[0] ?? [];
	const userIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'userId');
	if (userIdCol === -1) {
		return { rowIndex: -1, sheetTabId };
	}
	const roleCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'role');
	const optionIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'optionId');
	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);

	// Match the most recent row first so admins inspecting the sheet see the
	// latest copy disappear when they un-join.
	for (let i = rows.length - 1; i >= 1; i--) {
		const row = rows[i];
		if (!row) continue;
		const cell = row[userIdCol];
		if (typeof cell !== 'string' || cell !== userId) continue;

		// Match role if the column exists. Legacy rows without a role column are
		// matched on userId alone (the legacy single-row-per-user assumption).
		if (roleCol !== -1) {
			const cellRole = row[roleCol];
			if (typeof cellRole === 'string' && cellRole !== '' && cellRole !== role) continue;
		}

		// Prefer optionId match; fall back to optionTitle when the sheet predates
		// the optionId column.
		if (optionIdCol !== -1) {
			const cellOptionId = row[optionIdCol];
			if (typeof cellOptionId === 'string' && cellOptionId !== '' && cellOptionId !== optionId) {
				continue;
			}
			// optionId column exists but cell is empty (legacy row): fall back to
			// optionTitle if we have it.
			if (
				(typeof cellOptionId !== 'string' || cellOptionId === '') &&
				optionTitleCol !== -1 &&
				optionTitle !== ''
			) {
				const cellOptionTitle = row[optionTitleCol];
				if (typeof cellOptionTitle === 'string' && cellOptionTitle !== optionTitle) continue;
			}
		} else if (optionTitleCol !== -1 && optionTitle !== '') {
			const cellOptionTitle = row[optionTitleCol];
			if (typeof cellOptionTitle === 'string' && cellOptionTitle !== optionTitle) continue;
		}

		return { rowIndex: i, sheetTabId };
	}

	return { rowIndex: -1, sheetTabId };
}

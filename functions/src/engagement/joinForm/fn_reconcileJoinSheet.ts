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
	type Role as MemberRole,
} from './fn_syncOptionMembersToSheet';
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
export const fn_reconcileJoinSheet = onCall<
	ReconcileRequest,
	Promise<ReconcileResult>
>(
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
		let errors = 0;

		for (const optDoc of optionsSnap.docs) {
			const option = optDoc.data() as Statement;
			const integratedInto = (option as { integratedInto?: string }).integratedInto;
			if (option.isCluster === true || integratedInto) continue;
			optionsScanned++;

			const memberships: Array<{ creator: Creator; role: MemberRole }> = [
				...(option.joined ?? []).map(
					(c) => ({ creator: c, role: 'activist' as MemberRole }),
				),
				...(option.organizers ?? []).map(
					(c) => ({ creator: c, role: 'organizer' as MemberRole }),
				),
			].filter((m) => m.creator?.uid);

			for (const { creator, role } of memberships) {
				totalMembers++;
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

		const message = `Scanned ${optionsScanned} options / ${totalMembers} members → ${appended} appended, ${skippedAlreadyPresent} already present, ${skippedNoSubmission} without submission, ${errors} errors`;
		logger.info('[fn_reconcileJoinSheet] Done', {
			questionId,
			optionsScanned,
			totalMembers,
			appended,
			skippedAlreadyPresent,
			skippedNoSubmission,
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
			errors,
			message,
		};
	},
);

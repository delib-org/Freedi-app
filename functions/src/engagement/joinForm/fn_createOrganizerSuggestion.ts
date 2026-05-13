import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	Role,
	StatementType,
	createStatementObject,
	functionConfig,
} from '@freedi/shared-types';
import { assertJoinAdminAuthorized } from '../../utils/joinAuth';

interface Request {
	questionId: string;
	text: string;
	displayName?: string;
}

interface Result {
	statementId: string;
}

/**
 * Creates a new option under a question and tags it as an organizer
 * suggestion (`creatorRole: Role.admin`). Server-side enforcement of the
 * admin check keeps the organizer badge from being spoofed — direct client
 * writes that set `creatorRole` are rejected by firestore.rules, so this
 * callable is the only path that can produce one.
 *
 * Authorization: the caller must be the question's creator OR hold an
 * `admin` / `statement-creator` subscription to it. Both checks use the
 * admin SDK so rule evaluation never enters the picture.
 */
export const createOrganizerSuggestion = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { questionId, text, displayName } = request.data ?? {};
		if (!questionId || typeof questionId !== 'string') {
			throw new HttpsError('invalid-argument', 'questionId is required');
		}
		const trimmed = (text ?? '').trim();
		if (!trimmed) {
			throw new HttpsError('invalid-argument', 'text cannot be empty');
		}

		// Authorize via shared helper (creator OR admin/creator subscription
		// OR delegate with canManageOrganizerSolutions). Returns the loaded
		// question so we don't pay a second Firestore read.
		const { question } = await assertJoinAdminAuthorized({
			uid,
			questionId,
			operation: 'joinForm.createOrganizerSuggestion',
		});

		// Build the statement server-side so the creatorRole is set by us, not
		// by the caller. The admin SDK write bypasses rules so even with the
		// creatorRole guard in firestore.rules this still succeeds.
		const token = request.auth?.token as Record<string, unknown> | undefined;
		const tokenName = typeof token?.name === 'string' ? token.name : '';
		const tokenEmail = typeof token?.email === 'string' ? token.email : null;
		const tokenPicture = typeof token?.picture === 'string' ? token.picture : null;
		const newOption = createStatementObject({
			statement: trimmed,
			statementType: StatementType.option,
			parentId: questionId,
			topParentId: question.topParentId || questionId,
			creatorId: uid,
			creator: {
				uid,
				displayName: displayName?.trim() || tokenName || 'Organizer',
				email: tokenEmail,
				photoURL: tokenPicture,
				isAnonymous: false,
			},
			creatorRole: Role.admin,
		});

		if (!newOption) {
			logger.error('[createOrganizerSuggestion] Failed to build statement', { questionId, uid });
			throw new HttpsError('internal', 'Failed to construct suggestion');
		}

		await db.collection(Collections.statements).doc(newOption.statementId).set(newOption);

		logger.info('[createOrganizerSuggestion] Created', {
			questionId,
			statementId: newOption.statementId,
			uid,
		});

		return { statementId: newOption.statementId };
	},
);

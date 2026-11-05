import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignment,
	TablesCreateSessionRequest,
	TablesCreateSessionResponse,
} from '@freedi/shared-types';
import { TableAssignmentModeSchema } from '@freedi/shared-types';
import { is } from 'valibot';
import { db } from '../db';
import { Actor, actorFrom, newId, requireId, sessionRef } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { parseSettings, requireTitle, withoutUndefined } from './validation';

/**
 * `tablesCreateSession` (host): creates a draft session. The caller must be
 * signed in with a real account (Google), not Firebase anonymous auth.
 */
export async function createSession(
	firestore: Firestore,
	actor: Actor,
	req: TablesCreateSessionRequest,
	now: number = Date.now(),
): Promise<TablesCreateSessionResponse> {
	if (actor.isAnonymous) {
		throw new TablesError('permission-denied', 'Hosts must sign in with an account');
	}
	const title = requireTitle(req?.title, 'title');
	if (!is(TableAssignmentModeSchema, req?.mode)) {
		throw new TablesError('invalid-argument', 'mode must be direct or ranked');
	}
	const contextStatementId =
		req.contextStatementId === undefined
			? undefined
			: requireId(req.contextStatementId, 'contextStatementId');
	const settings = parseSettings(req.settings);

	const sessionId = newId();
	const session: TableAssignment = withoutUndefined({
		tableAssignmentId: sessionId,
		hostUid: actor.uid,
		contextStatementId,
		title,
		mode: req.mode,
		status: 'draft' as const,
		settings,
		createdAt: now,
		lastUpdate: now,
	});
	await sessionRef(firestore, sessionId).create(session);

	return { session };
}

export const tablesCreateSession = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<TablesCreateSessionRequest>,
	): Promise<TablesCreateSessionResponse> => {
		let uid: string | undefined;
		try {
			const actor = actorFrom(request);
			uid = actor.uid;

			return await createSession(db, actor, request.data);
		} catch (error) {
			throw toHttpsError(error, { operation: 'tableAssignment.tablesCreateSession', userId: uid });
		}
	},
);

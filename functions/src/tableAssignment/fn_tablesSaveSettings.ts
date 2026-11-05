import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type { TablesSaveSettingsRequest, TablesSaveSettingsResponse } from '@freedi/shared-types';
import { db } from '../db';
import { actorFrom, assertHost, readSession, requireId, sessionRef } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { parseSettings, requireTitle, withoutUndefined } from './validation';

/**
 * `tablesSaveSettings` (host): table size, balance tolerance, position
 * question (null removes it) and title. Mode is fixed at creation. Changing
 * an input makes any earlier preview stale (the run's inputHash no longer
 * matches). In direct mode the table size is frozen once registration opens,
 * because seats are already counted against it.
 */
export async function saveSettings(
	firestore: Firestore,
	uid: string,
	req: TablesSaveSettingsRequest,
	now: number = Date.now(),
): Promise<TablesSaveSettingsResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const title = req.title === undefined ? undefined : requireTitle(req.title, 'title');

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}

		const { positionQuestion: currentQuestion, ...currentRest } = session.settings;
		const nextQuestion =
			req.positionQuestion === undefined ? currentQuestion : (req.positionQuestion ?? undefined);
		const settings = parseSettings(
			withoutUndefined({
				...currentRest,
				tableSize: req.tableSize ?? session.settings.tableSize,
				balanceTolerance: req.balanceTolerance ?? session.settings.balanceTolerance,
				positionQuestion: nextQuestion,
			}),
		);
		if (
			session.mode === 'direct' &&
			session.status !== 'draft' &&
			settings.tableSize !== session.settings.tableSize
		) {
			throw new TablesError(
				'failed-precondition',
				'Table size is fixed once registration has opened in direct mode',
			);
		}

		tx.update(
			sessionRef(firestore, sessionId),
			withoutUndefined({ settings, title, lastUpdate: now }),
		);

		return { settings };
	});
}

export const tablesSaveSettings = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<TablesSaveSettingsRequest>,
	): Promise<TablesSaveSettingsResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await saveSettings(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesSaveSettings',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);

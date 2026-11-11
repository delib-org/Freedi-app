import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { is } from 'valibot';
import { TableAssignmentModeSchema, functionConfig } from '@freedi/shared-types';
import type {
	TableAssignmentSettings,
	TablesSaveSettingsRequest,
	TablesSaveSettingsResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { actorFrom, assertHost, readSession, requireId, sessionRef } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import {
	assertChoosableTableSize,
	parseSettings,
	requireTitle,
	withoutUndefined,
} from './validation';

/** A request value of `null` clears the setting and `undefined` keeps it. */
function clearable<T>(requested: T | null | undefined, current: T | undefined): T | undefined {
	return requested === undefined ? current : (requested ?? undefined);
}

function mergedSettings(
	current: TableAssignmentSettings,
	req: TablesSaveSettingsRequest,
): TableAssignmentSettings {
	return parseSettings(
		withoutUndefined({
			tableSize: req.tableSize ?? current.tableSize,
			balanceTolerance: req.balanceTolerance ?? current.balanceTolerance,
			positionQuestion: clearable(req.positionQuestion, current.positionQuestion),
			expectedParticipants: clearable(req.expectedParticipants, current.expectedParticipants),
			allowReturnByName: req.allowReturnByName ?? current.allowReturnByName,
		}),
	);
}

/**
 * `tablesSaveSettings` (host): table size, balance tolerance, position
 * question, expected people (null removes either), return by full name, title
 * and, in a draft only, the mode. Changing an input makes any earlier preview stale (the run's inputHash no longer
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
	if (req.mode !== undefined && !is(TableAssignmentModeSchema, req.mode)) {
		throw new TablesError('invalid-argument', 'mode must be direct or ranked');
	}

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (session.status === 'ended') {
			throw new TablesError('failed-precondition', 'The session has ended');
		}
		if (req.mode !== undefined && session.status !== 'draft') {
			throw new TablesError(
				'failed-precondition',
				'The mode can only be changed before registration opens',
			);
		}

		const settings = mergedSettings(session.settings, req);
		// Only a change is checked: an older session may still hold a size no longer offered.
		if (settings.tableSize !== session.settings.tableSize) {
			assertChoosableTableSize(settings.tableSize);
		}
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
			withoutUndefined({ settings, title, mode: req.mode, lastUpdate: now }),
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

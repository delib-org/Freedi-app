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
import { isOneTopic, parseTopicCount, writeOneTopic } from './oneTopic';
import {
	actorFrom,
	assertHost,
	readSession,
	requireId,
	sessionRef,
	topicsQuery,
} from './tablesAccess';
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
			topicCount: req.topicCount ?? current.topicCount,
		}),
	);
}

/**
 * `tablesSaveSettings` (host): table size, balance tolerance, position
 * question, expected people (null removes either), return by full name, title
 * and, in a draft only, the mode. Changing an input makes any earlier preview stale (the run's inputHash no longer
 * matches). In direct mode the table size is frozen once registration opens,
 * because seats are already counted against it.
 *
 * The topic count (IA tables-class-bridge 2.4) changes in a draft only. With
 * 'one' the session is `ranked` (asking for `direct` is refused, reason
 * `one-topic`) and its topics are replaced by one topic carrying the title;
 * a later title change renames that topic too.
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
	parseTopicCount(req.topicCount);

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

		const topicCountChanged =
			req.topicCount !== undefined && isOneTopic(settings) !== isOneTopic(session.settings);
		if (topicCountChanged && session.status !== 'draft') {
			throw new TablesError(
				'failed-precondition',
				'The number of topics is fixed once registration opens',
			);
		}
		const oneTopic = isOneTopic(settings);
		if (oneTopic && req.mode === 'direct') {
			throw new TablesError(
				'failed-precondition',
				'A one-topic session seats people by the system',
				'one-topic',
			);
		}
		const renamesTopic = oneTopic && (topicCountChanged || (title && title !== session.title));
		const topics = renamesTopic ? await tx.get(topicsQuery(firestore, sessionId)) : undefined;

		// ---- writes (all reads are done) ----
		if (topics) writeOneTopic(tx, firestore, sessionId, title ?? session.title, topics.docs);
		const mode = oneTopic && session.mode !== 'ranked' ? 'ranked' : req.mode;
		tx.update(
			sessionRef(firestore, sessionId),
			withoutUndefined({ settings, title, mode, lastUpdate: now }),
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

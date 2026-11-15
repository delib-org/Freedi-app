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
import { isOneTopic, oneTopicDoc, parseTopicCount } from './oneTopic';
import { Actor, actorFrom, newId, requireId, sessionRef, topicsCollection } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import {
	assertChoosableTableSize,
	parseSettings,
	requireTitle,
	withoutUndefined,
} from './validation';

/**
 * `tablesCreateSession` (host): creates a draft session. The caller must be
 * signed in with Google: anyone can mint an anonymous or email account, and a
 * session is the only thing here that lets its owner collect other people's names.
 *
 * Every new session is `splitByTopic` (IA tables-class-bridge 2.3: in direct
 * mode people choose a topic and the tables are made at closing). A one-topic
 * session (2.4) is `ranked` and gets its single topic here, named after it.
 */
export async function createSession(
	firestore: Firestore,
	actor: Actor,
	req: TablesCreateSessionRequest,
	now: number = Date.now(),
): Promise<TablesCreateSessionResponse> {
	if (!actor.hasGoogleAccount) {
		throw new TablesError('permission-denied', 'Hosts must sign in with Google');
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
	assertChoosableTableSize(settings.tableSize);
	parseTopicCount(settings.topicCount);
	const oneTopic = isOneTopic(settings);

	const sessionId = newId();
	const session: TableAssignment = withoutUndefined({
		tableAssignmentId: sessionId,
		hostUid: actor.uid,
		contextStatementId,
		title,
		mode: oneTopic ? ('ranked' as const) : req.mode,
		status: 'draft' as const,
		settings,
		splitByTopic: true,
		createdAt: now,
		lastUpdate: now,
	});
	await firestore.runTransaction(async (tx) => {
		tx.create(sessionRef(firestore, sessionId), session);
		if (oneTopic) {
			const topic = oneTopicDoc(sessionId, title);
			tx.set(topicsCollection(firestore).doc(topic.topicId), topic);
		}
	});

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

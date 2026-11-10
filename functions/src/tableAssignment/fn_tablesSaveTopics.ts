import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
	TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
	TABLE_ASSIGNMENT_MAX_TABLES_PER_TOPIC,
	functionConfig,
} from '@freedi/shared-types';
import type {
	TableAssignmentTopic,
	TablesSaveTopicsRequest,
	TablesSaveTopicsResponse,
	TablesTopicInput,
} from '@freedi/shared-types';
import { db } from '../db';
import { MAX_TOPICS_PER_SESSION } from './constants';
import {
	actorFrom,
	assertHost,
	newId,
	readSession,
	requireId,
	sessionRef,
	topicsCollection,
	topicsQuery,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { requireTitle, withoutUndefined } from './validation';

function parseTopic(input: TablesTopicInput, index: number): TablesTopicInput {
	if (typeof input !== 'object' || input === null) {
		throw new TablesError('invalid-argument', `topics[${index}] is invalid`);
	}
	const { description, sourceStatementId, consensus, maxTables, topicId } = input;
	if (
		description !== undefined &&
		(typeof description !== 'string' ||
			description.length > TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH)
	) {
		throw new TablesError('invalid-argument', `topics[${index}].description is invalid`);
	}
	if (consensus !== undefined && (typeof consensus !== 'number' || !Number.isFinite(consensus))) {
		throw new TablesError('invalid-argument', `topics[${index}].consensus is invalid`);
	}
	if (
		maxTables !== undefined &&
		(typeof maxTables !== 'number' ||
			!Number.isInteger(maxTables) ||
			maxTables < 1 ||
			maxTables > TABLE_ASSIGNMENT_MAX_TABLES_PER_TOPIC)
	) {
		throw new TablesError('invalid-argument', `topics[${index}].maxTables is invalid`);
	}

	return withoutUndefined({
		topicId: topicId === undefined ? undefined : requireId(topicId, `topics[${index}].topicId`),
		title: requireTitle(input.title, `topics[${index}].title`),
		description,
		sourceStatementId:
			sourceStatementId === undefined
				? undefined
				: requireId(sourceStatementId, `topics[${index}].sourceStatementId`),
		consensus,
		maxTables,
	});
}

/**
 * `tablesSaveTopics` (host): replaces the topic list, in the given order.
 * Topics lock when registration opens (people's preferences point at their
 * ids), so this works on a draft only. An input carrying a `topicId` keeps
 * that topic's id and must belong to this session.
 */
export async function saveTopics(
	firestore: Firestore,
	uid: string,
	req: TablesSaveTopicsRequest,
): Promise<TablesSaveTopicsResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	if (!Array.isArray(req.topics) || req.topics.length > MAX_TOPICS_PER_SESSION) {
		throw new TablesError(
			'invalid-argument',
			`topics must be a list of at most ${MAX_TOPICS_PER_SESSION}`,
		);
	}
	const inputs = req.topics.map(parseTopic);
	const givenIds = inputs.flatMap((t) => (t.topicId ? [t.topicId] : []));
	if (new Set(givenIds).size !== givenIds.length) {
		throw new TablesError('invalid-argument', 'Duplicate topicId');
	}

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (session.status !== 'draft') {
			throw new TablesError(
				'failed-precondition',
				'Topics can only be changed before registration opens',
			);
		}
		const existing = await tx.get(topicsQuery(firestore, sessionId));
		const existingIds = new Set(existing.docs.map((d) => d.id));
		for (const id of givenIds) {
			if (!existingIds.has(id)) {
				throw new TablesError('invalid-argument', 'topicId does not belong to this session');
			}
		}

		const topicIds = inputs.map((input) => input.topicId ?? newId());
		const keep = new Set(topicIds);
		existing.docs.forEach((d) => {
			if (!keep.has(d.id)) tx.delete(d.ref);
		});
		inputs.forEach((input, order) => {
			const topic: TableAssignmentTopic = withoutUndefined({
				topicId: topicIds[order],
				sessionId,
				title: input.title,
				description: input.description,
				sourceStatementId: input.sourceStatementId,
				consensus: input.consensus,
				maxTables: input.maxTables,
				order,
			});
			tx.set(topicsCollection(firestore).doc(topic.topicId), topic);
		});
		tx.update(sessionRef(firestore, sessionId), { lastUpdate: Date.now() });

		return { topicIds };
	});
}

export const tablesSaveTopics = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesSaveTopicsRequest>): Promise<TablesSaveTopicsResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await saveTopics(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesSaveTopics',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);

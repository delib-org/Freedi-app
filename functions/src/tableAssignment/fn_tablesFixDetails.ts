import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignmentStatus,
	TableAssignmentTopic,
	TablesFixDetailsRequest,
	TablesFixDetailsResponse,
	TablesFixDetailsTopic,
} from '@freedi/shared-types';
import { db } from '../db';
import { MAX_TOPICS_PER_SESSION } from './constants';
import {
	actorFrom,
	assertHost,
	readSession,
	requireId,
	sessionRef,
	topicsQuery,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';
import { requireTitle } from './validation';

const FIXABLE_STATUSES: readonly TableAssignmentStatus[] = [
	'registrationOpen',
	'registrationClosed',
	'published',
];

function parseTopicTitles(value: unknown): TablesFixDetailsTopic[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAX_TOPICS_PER_SESSION) {
		throw new TablesError(
			'invalid-argument',
			`topics must be a list of at most ${MAX_TOPICS_PER_SESSION}`,
		);
	}

	return value.map((topic: TablesFixDetailsTopic, index) => ({
		topicId: requireId(topic?.topicId, `topics[${index}].topicId`),
		title: requireTitle(topic?.title, `topics[${index}].title`),
	}));
}

/** The list must be the session's own topics, all of them, once each, in their current order. */
function assertSameTopicList(
	stored: readonly TableAssignmentTopic[],
	given: readonly TablesFixDetailsTopic[],
): void {
	const storedIds = new Set(stored.map((topic) => topic.topicId));
	if (!given.every((topic) => storedIds.has(topic.topicId))) {
		throw new TablesError('invalid-argument', 'A topic does not belong to this session');
	}
	const isSameList =
		given.length === stored.length &&
		given.every((topic, index) => topic.topicId === stored[index].topicId);
	if (!isSameList) {
		throw new TablesError(
			'invalid-argument',
			'Only titles can be fixed: topics cannot be added, removed or reordered',
		);
	}
}

function sortedTopicDocs(docs: QueryDocumentSnapshot[]): QueryDocumentSnapshot[] {
	return [...docs].sort((a, b) => {
		const [first, second] = [a.data() as TableAssignmentTopic, b.data() as TableAssignmentTopic];

		return first.order - second.order || first.topicId.localeCompare(second.topicId);
	});
}

/**
 * `tablesFixDetails` (host): corrects the gathering name and topic titles once
 * registration has opened. Titles are not part of the inputHash, so a ready
 * preview stays publishable and choices keep pointing at the same topics.
 */
export async function fixDetails(
	firestore: Firestore,
	uid: string,
	req: TablesFixDetailsRequest,
	now: number = Date.now(),
): Promise<TablesFixDetailsResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const newTitle = req.title === undefined ? undefined : requireTitle(req.title, 'title');
	const topicTitles = parseTopicTitles(req.topics);

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (!FIXABLE_STATUSES.includes(session.status)) {
			throw new TablesError(
				'failed-precondition',
				`Details cannot be fixed while the session is ${session.status}`,
			);
		}
		const topicDocs = sortedTopicDocs((await tx.get(topicsQuery(firestore, sessionId))).docs);
		if (topicTitles) {
			assertSameTopicList(
				topicDocs.map((d) => d.data() as TableAssignmentTopic),
				topicTitles,
			);
			topicDocs.forEach((d, index) => tx.update(d.ref, { title: topicTitles[index].title }));
		}
		const title = newTitle ?? session.title;
		tx.update(sessionRef(firestore, sessionId), { title, lastUpdate: now });

		return { title, topicIds: topicDocs.map((d) => d.id) };
	});
}

export const tablesFixDetails = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TablesFixDetailsRequest>): Promise<TablesFixDetailsResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await fixDetails(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesFixDetails',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
